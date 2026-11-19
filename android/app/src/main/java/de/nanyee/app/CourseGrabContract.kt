package de.nanyee.app

import kotlinx.serialization.json.*
import okhttp3.FormBody
import okhttp3.Request
import org.jsoup.Jsoup
import java.time.Instant
import java.time.LocalTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

internal data class GrabCategory(val code: String, val title: String)
internal data class GrabCourse(val code: String, val name: String, val teacher: String = "", val selected: Int = 0, val capacity: Int = 0, val time: String = "", val place: String = "")
internal data class GrabPage(val total: Int, val courses: List<GrabCourse>)
internal enum class GrabOutcome { ENROLLED, LIMIT, CONFLICT, NOT_OPEN, REJECTED, UNKNOWN }
internal data class GrabReply(val outcome: GrabOutcome, val message: String)
internal class GrabThrottle(val waitMillis: Long) : Exception("学校限流，等待后重试")
internal class GrabSelectionClosed : Exception("当前不在选课时间")
internal data class GrabDiscoveryDiagnostics(val status: Int?, val paths: List<String>, val finalPath: String, val title: String, val pathLinks: Int, val queryLinks: Int, val notice: String)
internal fun grabDiagnosticPath(path: String): String = if (path in setOf("/", "/new/welcome.page", "/new/student/xsxk/", "/new/student/xsxk", "/new/login", "/new/ssoLogin", "/authserver/login", "/cas/login")) path else "/[其他路径已隐藏]"
internal fun grabDiscoveryDiagnostics(status: Int?, paths: List<String>, html: String): GrabDiscoveryDiagnostics {
    val doc = Jsoup.parse(html)
    doc.select("script,style,noscript,input,textarea,select,nav,header,footer").remove()
    // Preserve only public school/UI vocabulary; names and account identifiers are never emitted.
    val publicText = Regex("南方医科大学|教务管理系统|教学管理系统|统一身份认证|统一认证登录|学生个人中心|当前不在选课时间|不是选课时间|不在选课时间|暂无可选类别|没有可选类别|选课尚未开放|选课未开放|选课时间|选课通知|选课|当前|尚未|开放|暂无|通知|欢迎|教务|系统|登录|首页|学生|课程|管理|时间|请|稍后|重试|[，。！？：；、（）《》 ·—-]+")
    fun safe(value: String) = publicText.findAll(value).joinToString("…") { it.value }.take(200)
    val text = doc.body().text()
    val index = text.indexOf("选课")
    val links = doc.select("[href],[data-href],[onclick]").map { listOf("href", "data-href", "onclick").joinToString(" ") { key -> it.attr(key) } }
    return GrabDiscoveryDiagnostics(status, paths.map(::grabDiagnosticPath), paths.lastOrNull()?.let(::grabDiagnosticPath).orEmpty(), safe(doc.title()),
        links.count { Regex("/xklx/\\d{1,8}(?!\\d)").containsMatchIn(it) }, links.count { Regex("xklxdm=\\d{1,8}(?!\\d)").containsMatchIn(it) },
        if (index < 0) "" else safe(text.substring((index - 40).coerceAtLeast(0), (index + 160).coerceAtMost(text.length))))
}
internal data class GrabClockSample(val wallMillis: Long, val elapsedMillis: Long, val serverMillis: Long)
internal fun grabClockOffset(samples: List<GrabClockSample>): Long = samples.filter { it.elapsedMillis >= 0 }.minByOrNull { it.elapsedMillis }
    ?.let { it.serverMillis - (it.wallMillis + it.elapsedMillis / 2) } ?: throw SchoolError(503, "CLOCK_UNAVAILABLE", "无法读取学校时间，请稍后重试。")
internal fun grabRetryMillis(header: String?, now: Instant = Instant.now()): Long = header?.toLongOrNull()?.coerceIn(1, 86400)?.times(1000)
    ?: runCatching { java.time.Duration.between(now, ZonedDateTime.parse(header, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()).toMillis().coerceAtLeast(1000) }.getOrDefault(60000)

internal fun grabCategories(html: String): List<GrabCategory> {
    if (listOf("统一认证登录", "扫码登录", "密码登录").any { it in html } || Jsoup.parse(html).select("input[type=password]").isNotEmpty()) throw SchoolError(410, "SESSION_EXPIRED", "学校会话已过期，请重新登录。")
    val values = linkedMapOf<String, String>()
    val code = Regex("(?:/xklx/|xklxdm=)(\\d{1,8})(?!\\d)", RegexOption.IGNORE_CASE)
    Jsoup.parse(html).select("[data-href], [href], [onclick]").forEach { element ->
        val link = listOf("data-href", "href", "onclick").joinToString(" ") { element.attr(it) }
        code.find(link)?.groupValues?.get(1)?.let { id ->
            val title = element.attr("lay-iframe").ifBlank { element.attr("title") }.ifBlank { element.text() }.trim().take(100)
            values.putIfAbsent(id, title.ifBlank { "类型$id" })
        }
    }
    code.findAll(html).forEach { values.putIfAbsent(it.groupValues[1], "类型${it.groupValues[1]}") }
    return values.map { GrabCategory(it.key, it.value) }
}

internal fun grabCourses(json: JsonElement): GrabPage {
    val obj = json as? JsonObject ?: error("课程列表格式无效")
    val rows = obj["rows"] as? JsonArray ?: error("课程列表格式无效")
    return GrabPage(obj.number("total").coerceAtLeast(0), rows.map { value ->
        val r = value.jsonObject
        val code = r.text("kcrwdm"); val name = r.text("kcmc")
        require(code.isNotBlank() && code.length <= 128 && name.isNotBlank() && name.length <= 200)
        GrabCourse(code, name, r.text("teaxm").take(100), (r.number("jxbrs").takeIf { it != 0 } ?: r.number("xkrs")).coerceAtLeast(0), r.number("pkrs").coerceAtLeast(0), r.text("sksj").take(500), r.text("skdd").take(300))
    })
}

internal fun grabRequest(category: String, page: Int? = null, course: GrabCourse? = null, conflict: Boolean = false): Request {
    require(category.matches(Regex("\\d{1,8}")))
    require((page == null) != (course == null))
    val base = "https://zhjw.smu.edu.cn/new/student/xsxk/xklx/$category"
    val form = FormBody.Builder()
    val suffix = if (page != null) {
        require(page in 1..20)
        form.add("page", "$page").add("rows", "50").add("sort", "kcrwdm").add("order", "asc"); "kxkc"
    } else {
        requireNotNull(course); require(course.code.isNotBlank() && course.code.length <= 128)
        form.add("kcrwdm", course.code).add("kcmc", course.name).add("qz", "-1").add("xxyqdm", "").add("hlct", if (conflict) "1" else "0"); "add"
    }
    return Request.Builder().url("$base/$suffix").header("Referer", base)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36")
        .header("Accept-Language", "zh-CN,zh;q=0.9").post(form.build()).build()
}

internal fun grabReply(text: String): GrabReply {
    val obj = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull()
        ?: return GrabReply(GrabOutcome.UNKNOWN, "响应非 JSON，结果未知")
    val message = obj.text("message").take(200)
    val outcome = when {
        obj.text("code").toIntOrNull() == 0 || message == "您已经选了该门课程" -> GrabOutcome.ENROLLED
        message.startsWith("超出选课要求门数") -> GrabOutcome.LIMIT
        "冲突" in message -> GrabOutcome.CONFLICT
        "不是选课时间" in message || "不在选课时间" in message -> GrabOutcome.NOT_OPEN
        obj["code"] == null -> GrabOutcome.UNKNOWN
        else -> GrabOutcome.REJECTED
    }
    return GrabReply(outcome, message.ifBlank { "学校未提供结果说明" })
}

internal data class GrabPlan(val category: GrabCategory, val preferences: List<GrabCourse>, val attempts: Int = 15, val primary: Int = 5, val conflicts: Boolean = false, val scheduled: String = "") {
    fun validate() {
        require(category.code.matches(Regex("\\d{1,8}")))
        require(preferences.size in 1..4 && preferences.map { it.code }.distinct().size == preferences.size)
        require(attempts in 1..120 && primary in 0..attempts)
        require(scheduled.isBlank() || scheduled.matches(Regex("(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d")))
    }
}
internal fun grabStartAt(time: String, offset: Long, now: Instant): Instant {
    val target = now.atZone(cabinZone).toLocalDate().atTime(LocalTime.parse(time)).atZone(cabinZone).toInstant().minusMillis(offset).minusMillis(50)
    return if (target <= now) target.plusSeconds(86400) else target
}

internal interface CourseGrabListing {
    suspend fun categories(): List<GrabCategory>
    suspend fun courses(category: String, page: Int): GrabPage
}
internal interface CourseGrabSource : CourseGrabListing {
    suspend fun clock(): Long
    suspend fun select(category: String, course: GrabCourse, conflict: Boolean): GrabReply
}
internal class GrabSessionOwner {
    private var account = ""
    var identity by mutableStateOf(UUID.randomUUID().toString()); private set
    fun login(value: String) {
        if (account.isNotEmpty() && account != value) identity = UUID.randomUUID().toString()
        account = value
    }
    fun logout() { account = ""; identity = UUID.randomUUID().toString() }
}
internal class ReacquiringCourseGrabSource(private val acquire: suspend () -> CourseGrabSource) : CourseGrabSource {
    override suspend fun categories() = acquire().categories()
    override suspend fun courses(category: String, page: Int) = acquire().courses(category, page)
    override suspend fun clock() = acquire().clock()
    override suspend fun select(category: String, course: GrabCourse, conflict: Boolean) = acquire().select(category, course, conflict)
}
