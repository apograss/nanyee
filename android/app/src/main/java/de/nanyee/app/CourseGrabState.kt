package de.nanyee.app

import androidx.compose.runtime.*
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import java.time.Instant
import kotlin.coroutines.coroutineContext
import kotlin.random.Random

internal class CourseGrabRun(
    private val pause: suspend (Long) -> Unit = { delay(it) },
    private val now: () -> Instant = { Instant.now() },
    private val jitter: (Long, Long) -> Long = { a, b -> Random.nextLong(a, b + 1) }
) {
    var active by mutableStateOf(false); private set
    var attempt by mutableIntStateOf(0); private set
    var notOpenPolls by mutableIntStateOf(0); private set
    var status by mutableStateOf(""); private set
    var outcome by mutableStateOf(""); private set
    var events by mutableStateOf(emptyList<String>()); private set
    private fun log(text: String) { status = text; events = (events + text).takeLast(500) }
    suspend fun execute(source: CourseGrabSource, plan: GrabPlan) {
        check(!active); plan.validate()
        active = true; attempt = 0; notOpenPolls = 0; outcome = ""; events = emptyList()
        var unknown = false
        var inFlight = false
        try {
            log("正在校准学校时间（3 个样本）")
            var offset: Long
            while (true) {
                try { offset = source.clock(); break }
                catch (e: GrabThrottle) { log("校时被限流，等待 ${e.waitMillis / 1000} 秒"); pause(e.waitMillis.coerceAtLeast(1000)) }
            }
            log("学校时钟偏移：${offset} ms；Date 时间精度约为一秒")
            if (plan.scheduled.isNotBlank()) {
                val target = grabStartAt(plan.scheduled, offset, now())
                log("等待学校时间 ${plan.scheduled}，请保持前台")
                while (now() < target) pause(java.time.Duration.between(now(), target).toMillis().coerceIn(1, 1000))
            }
            while (attempt < plan.attempts) {
                coroutineContext.ensureActive()
                val index = if (attempt < plan.primary) 0 else (attempt - plan.primary) % plan.preferences.size
                val course = plan.preferences[index]
                attempt++
                log("[$attempt/${plan.attempts}] 正在尝试 ${course.name}")
                val reply = try {
                    inFlight = true
                    var value = source.select(plan.category.code, course, false)
                    inFlight = false
                    if (value.outcome == GrabOutcome.CONFLICT && plan.conflicts) {
                        coroutineContext.ensureActive()
                        log("用户允许冲突确认，确认 ${course.name}")
                        inFlight = true
                        value = source.select(plan.category.code, course, true)
                        inFlight = false
                    }
                    value
                } catch (e: GrabThrottle) {
                    inFlight = false; attempt--
                    log("学校限流，等待 ${e.waitMillis / 1000} 秒后重试")
                    pause(e.waitMillis.coerceAtLeast(1000)); continue
                } catch (e: CancellationException) { throw e }
                catch (e: Exception) {
                    inFlight = false
                    if (e is SchoolError && e.status in setOf(401, 410)) {
                        outcome = "学校会话已过期，请重新登录并在教务系统确认结果"; return
                    }
                    GrabReply(GrabOutcome.UNKNOWN, "请求异常，结果未知")
                }
                log(reply.message)
                when (reply.outcome) {
                    GrabOutcome.ENROLLED -> { outcome = "选课成功：${course.name}"; return }
                    GrabOutcome.LIMIT -> { outcome = "已达门数上限（不代表本次选课成功）"; return }
                    GrabOutcome.NOT_OPEN -> {
                        attempt--; notOpenPolls++
                        if (notOpenPolls >= 600) { outcome = if (unknown) "结果未知，请在教务系统确认" else "等待开放超时（600 次），已停止"; return }
                        log("学校尚未开放，等待中（$notOpenPolls/600，不消耗尝试次数）")
                        pause(jitter(500, 1000)); continue
                    }
                    GrabOutcome.UNKNOWN -> unknown = true
                    else -> Unit
                }
                notOpenPolls = 0
                if (attempt < plan.attempts) pause(jitter(100, 300))
            }
            outcome = if (unknown) "结果未知，请在教务系统确认" else "尝试次数已用完，未选上"
        } catch (e: CancellationException) {
            outcome = if (inFlight || unknown) "已取消；结果未知，请在教务系统确认" else "已取消"
            throw e
        } catch (e: Exception) {
            outcome = if (unknown || inFlight) "结果未知，请在教务系统确认" else (e as? SchoolError)?.message ?: "无法开始，请稍后重试"
        } finally { active = false }
    }
}

internal enum class GrabDemoScenario(val label: String) {
    SUCCESS("第 3 次成功"), NOT_OPEN("未开放后开放"), CONFLICT("课程冲突"), FULL("课程已满"), LIMIT("门数上限"), UNKNOWN("超时结果未知")
}
internal class DemoCourseGrabSource(private val scenario: GrabDemoScenario = GrabDemoScenario.SUCCESS) : CourseGrabSource {
    private var calls = 0
    override suspend fun categories() = listOf(GrabCategory("12", "演示公共选修课"), GrabCategory("01", "演示通识课"))
    override suspend fun courses(category: String, page: Int) = GrabPage(6, if (page != 1) emptyList() else (1..6).map {
        GrabCourse("demo-$category-$it", "演示课程 $it", "演示教师 $it", 20 + it, 30, "周三 7–8 节", "示例教学楼 $it")
    })
    override suspend fun clock() = 0L
    override suspend fun select(category: String, course: GrabCourse, conflict: Boolean): GrabReply {
        delay(350); calls++
        return when (scenario) {
            GrabDemoScenario.SUCCESS -> if (calls >= 3) GrabReply(GrabOutcome.ENROLLED, "演示：选课成功") else GrabReply(GrabOutcome.REJECTED, "演示：课程已满")
            GrabDemoScenario.NOT_OPEN -> if (calls <= 3) GrabReply(GrabOutcome.NOT_OPEN, "当前不是选课时间") else GrabReply(GrabOutcome.ENROLLED, "演示：开放后成功")
            GrabDemoScenario.CONFLICT -> if (conflict) GrabReply(GrabOutcome.ENROLLED, "演示：允许冲突后成功") else GrabReply(GrabOutcome.CONFLICT, "与已选课程上课时间有冲突")
            GrabDemoScenario.FULL -> GrabReply(GrabOutcome.REJECTED, "演示：课程已满")
            GrabDemoScenario.LIMIT -> GrabReply(GrabOutcome.LIMIT, "超出选课要求门数(1.0门)")
            GrabDemoScenario.UNKNOWN -> GrabReply(GrabOutcome.UNKNOWN, "演示：请求超时，结果未知")
        }
    }
}

internal class CourseGrabState : ViewModel() {
    val run = CourseGrabRun()
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf(""); private set
    var categories by mutableStateOf(emptyList<GrabCategory>()); private set
    var category by mutableStateOf<GrabCategory?>(null); private set
    var courses by mutableStateOf(emptyList<GrabCourse>()); private set
    var preferences by mutableStateOf(emptyList<GrabCourse>()); private set
    var query by mutableStateOf("")
    var attempts by mutableStateOf("15")
    var primary by mutableStateOf("5")
    var conflicts by mutableStateOf(false)
    var scheduled by mutableStateOf("")
    var confirmation by mutableStateOf<GrabPlan?>(null); private set
    var scenario by mutableStateOf(GrabDemoScenario.SUCCESS); private set
    private var source: CourseGrabSource? = null
    private var session: String? = null
    private var job: Job? = null
    val locked get() = busy || run.active
    fun onSessionChanged(identity: String) {
        if (identity == session) return
        if (source != null || run.active || (session != null && identity.isEmpty())) job?.cancel()
        session = identity; source = null; categories = emptyList(); category = null; courses = emptyList(); preferences = emptyList(); confirmation = null
    }
    private fun work(block: suspend () -> Unit) {
        if (locked) return
        busy = true; error = ""
        job = viewModelScope.launch {
            try { block() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { error = when (e) { is GrabThrottle -> "学校限流，请等待 ${e.waitMillis / 1000} 秒后重试"; is SchoolError -> e.message.orEmpty(); else -> "学校数据暂时无法读取，请稍后重试" } }
            finally { busy = false }
        }
    }
    fun load(identity: () -> String, provider: suspend () -> CourseGrabSource) = work {
        source = null; categories = emptyList(); category = null; courses = emptyList(); preferences = emptyList(); confirmation = null
        val next = provider()
        onSessionChanged(identity())
        source = next
        categories = next.categories()
        if (categories.isEmpty()) error = "暂无选课类型，可能尚未开放。"
    }
    fun choose(value: GrabCategory) = work {
        confirmation = null; category = value; courses = emptyList(); preferences = emptyList()
        val current = checkNotNull(source)
        val all = mutableListOf<GrabCourse>()
        for (page in 1..20) {
            val result = current.courses(value.code, page)
            all.addAll(result.courses)
            if (result.courses.isEmpty() || all.size >= result.total) break
        }
        courses = all.distinctBy { it.code }
    }
    fun select(value: GrabCourse) {
        if (!locked && preferences.size < 4 && preferences.none { it.code == value.code }) preferences = preferences + value
    }
    fun remove(value: GrabCourse) { if (!locked) preferences = preferences.filterNot { it.code == value.code } }
    fun move(index: Int) {
        if (locked || index !in 1 until preferences.size) return
        preferences = preferences.toMutableList().apply { val value = removeAt(index); add(index - 1, value) }
    }
    fun demoScenario(value: GrabDemoScenario) { if (!locked) { onSessionChanged("demo-$value"); scenario = value } }
    fun review() {
        if (locked) return
        error = ""
        val plan = runCatching { GrabPlan(checkNotNull(category), preferences.toList(), attempts.toInt(), primary.toInt(), conflicts, scheduled.trim()).also { it.validate() } }.getOrNull()
        if (plan == null || source == null) error = "请选择类型与 1–4 个志愿；次数须为 1–120，首志愿次数须为 0–总次数；时间须为 HH:mm:ss。" else confirmation = plan
    }
    fun dismiss() { confirmation = null }
    fun start() {
        val plan = confirmation ?: return
        val current = source ?: return
        confirmation = null
        work { run.execute(current, plan) }
    }
    fun cancel() { job?.cancel() }
}
