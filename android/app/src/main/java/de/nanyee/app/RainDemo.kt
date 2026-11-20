package de.nanyee.app

import kotlinx.serialization.json.*
import java.util.Base64

internal class MemoryRainStore : RainStore {
    private val values = mutableMapOf<String, String>()
    override fun read(key: String) = values[key].orEmpty()
    override fun write(key: String, value: String) { values[key] = value }
    override fun clear() { values.clear() }
}
internal class RainLiveSlides {
    var target: Pair<String, Int>? = null; private set
    fun accept(frame: RainFrame): Boolean {
        if (frame.op !in setOf("hello", "showpresentation", "slide", "slidenav")) return false
        val id = frame.presentation.ifBlank { target?.first.orEmpty() }
        if (id.isBlank()) return false
        val number = if (frame.slide > 0) frame.slide else if (id == target?.first) target?.second ?: 1 else 1
        target = id to number
        return true
    }
    fun clear() { target = null }
}
internal enum class RainDemoFailure(val label: String) {
    NONE("成功"), PROFILE("会话失效"), QR("获取码失败"), POLL("授权过期"), COURSES("课程失败"), ON_LESSON("开课检查失败"), EMPTY("空列表"), SCAN("课堂码失败"), JOIN("加入失败"), LOCATION("定位签到失败"), SLIDES("课件失败"), IMAGES("图片失败"), LIVE("直播断开"), ANSWER("作答失败"), RETRY("重试失败"), UNKNOWN("提交结果未知"), GALLERY("保存失败")
}
internal class DemoRainBackend(private val host: RainHost, private val clock: () -> Long = System::currentTimeMillis) : RainBackend {
    var failure = RainDemoFailure.NONE
    val writes = mutableListOf<String>()
    var leaveCount = 0; private set
    var connectCount = 0; private set
    private fun check(part: RainDemoFailure) { if (failure == part) throw RainFailure(if (part == RainDemoFailure.PROFILE) "SESSION" else "DEMO", "演示：${part.label}，没有发出网络请求。") }
    private fun result(part: RainDemoFailure): RainResult { writes.add(part.name); return when (failure) { RainDemoFailure.UNKNOWN -> RainResult.UNKNOWN; part -> RainResult.REJECTED; else -> RainResult.SUCCESS } }
    override suspend fun user(): RainUser { check(RainDemoFailure.PROFILE); return RainUser("1001", "演示同学") }
    override suspend fun sendSms(phone: String, proof: RainCaptchaProof) { rainSmsBody(phone, proof); check(RainDemoFailure.PROFILE) }
    override suspend fun login(method: RainLoginMethod, account: String, code: String, proof: RainCaptchaProof) {
        rainLoginBody(method, account, code, proof, "offline-device")
        check(RainDemoFailure.PROFILE)
        if (method == RainLoginMethod.SMS && code != "123456") throw RainFailure("LOGIN", "演示短信验证码为 123456。")
    }
    override suspend fun qr(): RainQr { check(RainDemoFailure.QR); return RainQr("offline-token", "https://${host.domain}/demo/login") }
    override suspend fun poll(qr: RainQr) = failure != RainDemoFailure.POLL
    override suspend fun courses(): List<RainCourse> { check(RainDemoFailure.COURSES); return if (failure == RainDemoFailure.EMPTY) emptyList() else listOf(RainCourse("c1", "class1", "航海概论 · 雨课堂演示", "示例教师"), RainCourse("c2", "class2", "高等数学 · 尚未开课", "示例教师")) }
    override suspend fun onLesson(): List<RainOnLesson> { check(RainDemoFailure.ON_LESSON); return if (failure == RainDemoFailure.EMPTY) emptyList() else listOf(RainOnLesson("c1", "lesson1")) }
    override suspend fun scan(user: RainUser, url: String): String { rainScanUrl(host, url); require(user == user()); return when (result(RainDemoFailure.SCAN)) { RainResult.SUCCESS -> "lesson1"; RainResult.REJECTED -> throw RainFailure("REJECTED", "演示：课堂码无效。"); RainResult.UNKNOWN -> throw RainFailure("UNKNOWN", "演示：扫码结果未知，请先核验。") } }
    override suspend fun join(user: RainUser, lessonId: String): RainLesson { require(user == user()); return when (result(RainDemoFailure.JOIN)) { RainResult.SUCCESS -> RainLesson(host, user.id, lessonId, "offline-bearer", "offline-lesson"); RainResult.REJECTED -> throw RainFailure("REJECTED", "演示：课堂已关闭。"); RainResult.UNKNOWN -> throw RainFailure("UNKNOWN", "演示：签到结果未知，请先核验。") } }
    override suspend fun eligibility(lesson: RainLesson) = RainEligibility(true, false, "示例教学楼（仅活动地址说明）")
    override suspend fun locate(action: RainAction.Location): RainResult { rainValidate(action, clock()); require(action.lesson.uid == user().id); return result(RainDemoFailure.LOCATION) }
    override suspend fun presentation(lesson: RainLesson, id: String): RainPresentation {
        check(RainDemoFailure.SLIDES)
        if (failure == RainDemoFailure.EMPTY) return RainPresentation(id, "空课件演示", emptyList())
        val slides = (1..6).map { type ->
            val prompt = when (type) { 1 -> "请手动选择航向单位"; 2 -> "请手动选择海洋"; 3 -> "选择你喜欢的课堂形式（最多两项）"; 4 -> "请手动填写两个空白"; 5 -> "写下今天的学习收获"; else -> "请判断：安全是航海的首要原则" }
            val options = if (type in setOf(1, 2, 3, 6)) listOf(RainOption("A", "选项甲"), RainOption("B", "选项乙"), RainOption("C", "选项丙")) else emptyList()
            RainSlide("s$type", type, "https://${host.domain}/offline/slide$type.png", RainProblem("p$type", type, prompt, options, if (type == 4) 2 else 0, if (type in 2..3) 2 else 1, clock() - 20000))
        } + RainSlide("s7", 7, "https://${host.domain}/offline/slide7.png", RainProblem("p7", 99, "未知题型：只读，请使用官方客户端", supported = false))
        return RainPresentation(id, "离线课堂课件", slides)
    }
    override suspend fun answer(action: RainAction.Answer): RainResult { require(action.lesson.uid == user().id); rainValidate(action, clock()); return result(if (action.retry) RainDemoFailure.RETRY else RainDemoFailure.ANSWER) }
    override suspend fun image(url: String): ByteArray { check(RainDemoFailure.IMAGES); return Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1kAAAAASUVORK5CYII=") }
    override fun connect(lesson: RainLesson, frame: (RainFrame) -> Unit, ended: () -> Unit): RainLive {
        connectCount++
        if (failure == RainDemoFailure.LIVE) ended() else {
            val time = clock() - 20000
            frame(RainFrame("hello", "demo-presentation", 1, (1..6).map { RainEvent("problem", "已开放：第 $it 题（手动）", time, "demo-presentation", it, "p$it", 10) }))
            frame(RainFrame("callpaused", events = listOf(RainEvent("event", "演示：随机点名提示", clock()))))
        }
        var closed = false
        return object : RainLive { override fun close() { if (!closed) { closed = true; leaveCount++ } } }
    }
    override suspend fun clear() = Unit
}
internal class RainLiveOwner {
    private var lesson: RainLesson? = null
    private var connection: RainLive? = null
    fun update(visible: Boolean, resumed: Boolean, next: RainLesson?, open: (RainLesson) -> RainLive) {
        val active = next?.takeIf { visible && resumed }
        if (lesson == active) return
        stop()
        if (active != null) { lesson = active; connection = open(active) }
    }
    fun stop() { connection?.close(); connection = null; lesson = null }
}
