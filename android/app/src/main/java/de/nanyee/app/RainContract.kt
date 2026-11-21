// Adapted from AneryCoft/course_helper (GPL-3.0), lib/api/{login,course}.dart and lib/models/presentation.dart.
package de.nanyee.app

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.jsoup.Jsoup

@Serializable internal enum class RainHost(val domain: String) { WWW("www.yuketang.cn"), PRO("pro.yuketang.cn"), CHANGJIANG("changjiang.yuketang.cn"), HUANGHE("huanghe.yuketang.cn") }
internal class RainFailure(val kind: String, message: String) : Exception(message)
@Serializable internal data class RainUser(val id: String, val name: String)
@Serializable internal data class RainCourse(val id: String, val classroom: String, val name: String, val teacher: String, val teacherAvatar: String = "", val classroomName: String = "")
internal data class RainCourseLists(val live: List<RainCourse>, val remaining: List<RainCourse>)
internal fun rainCourseLists(courses: List<RainCourse>, lessons: List<RainOnLesson>): RainCourseLists {
    val liveIds = lessons.map { it.courseId }.toSet()
    val (live, remaining) = courses.partition { it.id in liveIds }
    return RainCourseLists(live, remaining)
}
internal fun rainCourseSubtitle(course: RainCourse) = listOf(course.teacher, course.classroomName).filter { it.isNotBlank() }.joinToString(" · ")
@Serializable internal data class RainOnLesson(val courseId: String, val lessonId: String)
internal data class RainQr(val token: String, val content: String, val image: String = "")
internal data class RainLesson(val host: RainHost, val uid: String, val id: String, val bearer: String, val token: String)
@Serializable internal data class RainOption(val key: String, val text: String)
@Serializable internal data class RainProblem(val id: String, val type: Int, val body: String, val options: List<RainOption> = emptyList(), val blanks: Int = 0, val maximum: Int = 1, val dt: Long = 0, val supported: Boolean = true)
@Serializable internal data class RainSlide(val id: String, val index: Int, val image: String, val problem: RainProblem? = null)
@Serializable internal data class RainPresentation(val id: String, val title: String, val slides: List<RainSlide>)
@Serializable internal data class RainDraft(val options: List<String> = emptyList(), val text: String = "")
@Serializable internal data class RainEligibility(val required: Boolean, val signed: Boolean, val address: String)
internal data class RainUnlock(val problem: String, val dt: Long, val seconds: Int)
internal data class RainEvent(val type: String, val title: String, val dt: Long, val presentation: String = "", val slide: Int = 0, val problem: String = "", val seconds: Int = 0)
internal data class RainFrame(val op: String, val presentation: String = "", val slide: Int = 0, val events: List<RainEvent> = emptyList(), val unlock: RainUnlock? = null, val finished: Boolean = false, val refreshLocation: Boolean = false, val extension: Int = 0)
internal enum class RainResult { SUCCESS, REJECTED, UNKNOWN }
internal interface RainLive { fun close() }
internal interface RainBackend {
    val loginMessage: String get() = ""
    fun cancelLogin() {}
    suspend fun sendSms(phone: String, proof: RainCaptchaProof) { error("Login unavailable") }
    suspend fun login(method: RainLoginMethod, account: String, code: String, proof: RainCaptchaProof) { error("Login unavailable") }
    suspend fun user(): RainUser
    suspend fun qr(): RainQr
    suspend fun poll(qr: RainQr): Boolean
    suspend fun courses(): List<RainCourse>
    suspend fun onLesson(): List<RainOnLesson>
    suspend fun scan(user: RainUser, url: String): String
    suspend fun join(user: RainUser, lessonId: String): RainLesson
    suspend fun eligibility(lesson: RainLesson): RainEligibility
    suspend fun locate(action: RainAction.Location): RainResult
    suspend fun presentation(lesson: RainLesson, id: String): RainPresentation
    suspend fun answer(action: RainAction.Answer): RainResult
    suspend fun image(url: String): ByteArray
    fun connect(lesson: RainLesson, frame: (RainFrame) -> Unit, ended: () -> Unit): RainLive
    suspend fun clear()
}
internal sealed interface RainAction {
    val key: String
    data class Join(val user: RainUser, val lessonId: String, val title: String) : RainAction { override val key get() = "join:$lessonId" }
    data class Scan(val user: RainUser, val url: String) : RainAction { override val key = "scan" }
    data class Location(val lesson: RainLesson, val position: XxtPosition, val eligibility: RainEligibility) : RainAction { override val key get() = "location:${lesson.id}" }
    data class Answer(val lesson: RainLesson, val problem: RainProblem, val unlock: RainUnlock, val draft: RainDraft, val retry: Boolean) : RainAction { override val key get() = "answer:${lesson.id}:${problem.id}" }
    data class Export(val lesson: RainLesson, val presentation: RainPresentation, val slides: List<RainSlide>) : RainAction { override val key = "gallery" }
}
internal class RainGate {
    var confirmation: RainAction? = null; private set
    private var writing = false
    fun preview(action: RainAction, now: Long) { check(!writing); rainValidate(action, now); confirmation = action }
    fun dismiss() { check(!writing); confirmation = null }
    fun begin(now: Long): RainAction { check(!writing); val value = requireNotNull(confirmation); rainValidate(value, now); writing = true; confirmation = null; return value }
    fun finish() { check(writing); writing = false }
}
internal class RainPendingWrites(private val store: RainStore, host: RainHost, uid: String) {
    private val key = "pending.${host.name}.$uid"
    val pending get() = store.read(key)
    fun begin(action: String) { check(pending.isBlank()); require(action.isNotBlank()); store.write(key, action) }
    fun completed() { store.write(key, "") }
}
internal fun rainCode(data: JsonObject) = data.text("code").toIntOrNull()
internal fun rainResult(data: JsonObject) = when (rainCode(data)) { 0 -> RainResult.SUCCESS; null -> RainResult.UNKNOWN; else -> RainResult.REJECTED }
internal fun rainData(value: JsonObject): JsonElement {
    if ("code" in value && rainCode(value) == null) throw RainFailure("FORMAT", "雨课堂响应状态格式有变。")
    if (rainCode(value)?.let { it != 0 } == true) throw RainFailure("UPSTREAM", "雨课堂未能完成请求，请刷新或使用官方客户端。")
    return value["data"]?.takeIf { it != JsonNull } ?: throw RainFailure("FORMAT", "雨课堂响应格式有变。")
}
internal fun rainCourses(value: JsonObject): List<RainCourse> {
    val rows = rainData(value) as? JsonArray ?: throw RainFailure("FORMAT", "雨课堂课程格式有变。")
    return rows.map {
        val row = it.jsonObject; val teacher = row["teacher"] as? JsonObject
        RainCourse(row.text("course_id"), row.text("classroom_id"), xxtPlain(row.text("course_name")), teacher?.text("name").orEmpty(), teacher?.text("avatar").orEmpty(), row.text("classroom_name"))
    }.also { require(it.all { row -> row.id.isNotBlank() }) }
}
internal fun rainOnLesson(value: JsonObject): List<RainOnLesson> {
    val rows = (rainData(value) as? JsonObject)?.get("onLessonClassrooms") as? JsonArray ?: throw RainFailure("FORMAT", "雨课堂上课列表格式有变。")
    return rows.map { RainOnLesson(it.jsonObject.text("courseId"), it.jsonObject.text("lessonId")) }.also { require(it.all { row -> row.courseId.isNotBlank() && row.lessonId.isNotBlank() }) }.distinct()
}
internal fun rainQr(value: JsonObject): RainQr {
    val data = rainData(value).jsonObject
    return RainQr(data.text("token"), data.text("qrContent"), data.text("qrImage")).also { require(it.token.isNotBlank() && (it.content.isNotBlank() || it.image.isNotBlank()) && it.content.length <= 2000) }
}
internal fun rainProblem(row: JsonObject): RainProblem {
    val type = row.number("problemType")
    val options = (row["options"] as? JsonArray).orEmpty().map { RainOption(it.jsonObject.text("key"), xxtPlain(it.jsonObject.text("value"))) }
    val blanks = (row["blanks"] as? JsonArray)?.size ?: 0
    val choice = type in setOf(1, 2, 3, 6)
    val media = Jsoup.parseBodyFragment(row.text("body")).select("img,video,audio,svg,math").isNotEmpty() || (row["options"] as? JsonArray).orEmpty().any { Jsoup.parseBodyFragment(it.jsonObject.text("value")).select("img,video,audio,svg,math").isNotEmpty() }
    val maximum = when (type) { 2 -> options.size; 3 -> row.text("pollingCount").toIntOrNull() ?: 1; else -> 1 }
    return RainProblem(row.text("problemId"), type, xxtPlain(row.text("body")), options, blanks, maximum, row.text("dt").toLongOrNull() ?: 0,
        row.text("problemId").isNotBlank() && type in 1..6 && !media && blanks <= 50 && (!choice || (options.isNotEmpty() && maximum in 1..options.size && options.all { it.key.isNotBlank() } && options.distinctBy { it.key }.size == options.size)))
}
internal fun rainPresentation(id: String, value: JsonObject): RainPresentation {
    val rows = value["slides"] as? JsonArray ?: throw RainFailure("FORMAT", "雨课堂幻灯片格式有变。")
    require(rows.size <= 1000)
    return RainPresentation(id, xxtPlain(value.text("title")), rows.map { val row = it.jsonObject; RainSlide(row.text("id"), row.number("index"), row.text("coverAlt").ifBlank { row.text("cover") }, (row["problem"] as? JsonObject)?.let(::rainProblem)) })
}
internal fun rainEligibility(value: JsonObject): RainEligibility {
    val data = if ("data" in value) rainData(value).jsonObject else value
    val required = (data["needLocationSignIn"] as? JsonPrimitive)?.booleanOrNull ?: throw RainFailure("FORMAT", "位置签到格式有变。")
    val signed = (data["signed"] as? JsonPrimitive)?.booleanOrNull ?: throw RainFailure("FORMAT", "位置签到格式有变。")
    return RainEligibility(required, signed, xxtPlain(data.text("address")))
}
internal fun rainEvent(row: JsonObject) = RainEvent(row.text("type"), xxtPlain(row.text("title")).ifBlank { row.text("code") }, row.text("dt").toLongOrNull() ?: 0, row.text("pres"), row.number("si"), row.text("prob"), row.number("limit"))
internal fun rainFrame(value: JsonObject): RainFrame {
    val op = value.text("op")
    val events = (value["timeline"] as? JsonArray).orEmpty().takeLast(500).map { rainEvent(it.jsonObject) }.filter { it.type in setOf("slide", "problem", "event") }.toMutableList()
    (value["event"] as? JsonObject)?.let { events.add(rainEvent(JsonObject(it + ("type" to JsonPrimitive("event"))))) }
    val latest = if (op == "hello") events.lastOrNull { it.type == "slide" && it.presentation.isNotBlank() } else null
    val problem = value["problem"] as? JsonObject
    val unlock = if (op == "unlockproblem" && problem != null) RainUnlock(problem.text("prob").ifBlank { problem.text("sid") }, problem.text("dt").toLongOrNull() ?: 0, problem.number("limit")) else null
    val notice = when (op) { "showfinished" -> "课件演示结束"; "lessonfinished" -> "课堂已结束"; "locationcheckinext" -> "位置签到开始 / 更新"; "locationcheckinend" -> "位置签到结束"; "extendtime" -> "题目作答时间延长"; else -> "" }
    if (notice.isNotBlank()) events.add(RainEvent("event", notice, value.text("dt").toLongOrNull() ?: 0))
    return RainFrame(op, latest?.presentation ?: value.text("presentation"), latest?.slide ?: if (op == "slidenav") (value["slide"] as? JsonObject)?.number("si") ?: 0 else value.number("slideindex"), events, unlock,
        op == "lessonfinished" || (op == "hello" && value.text("message") == "lesson finished"), op in setOf("locationcheckinext", "locationcheckinend"), if (op == "extendtime") problem?.number("extend") ?: 0 else 0)
}
internal fun rainScanUrl(host: RainHost, value: String): String {
    val url = value.toHttpUrl()
    require(url.isHttps && url.host == host.domain && url.port == 443 && url.username.isEmpty() && url.password.isEmpty() && value.length <= 4000) { "仅支持当前服务器的 HTTPS 雨课堂课堂码，请先选择对应服务器。" }
    return value
}
internal fun rainValidate(action: RainAction, now: Long) {
    when (action) {
        is RainAction.Join -> require(action.user.id.isNotBlank() && action.lessonId.isNotBlank())
        is RainAction.Scan -> require(action.user.id.isNotBlank() && action.url.isNotBlank())
        is RainAction.Location -> {
            val p = action.position
            require(action.eligibility.required && !action.eligibility.signed) { "当前无需位置签到。" }
            require(p.latitude.isFinite() && p.longitude.isFinite() && p.latitude in -90.0..90.0 && p.longitude in -180.0..180.0 && p.accuracy.isFinite() && p.accuracy in 0f..100f && now - p.obtainedAt in 0..120000) { "请重新获取手机真实位置（两分钟内有效）。" }
        }
        is RainAction.Answer -> {
            val problem = action.problem; val draft = action.draft
            require(problem.supported && problem.id == action.unlock.problem && action.unlock.dt > 0) { "题目尚未开放或缺少原始时间戳，请使用官方雨课堂。" }
            require(draft.options.all { it.length <= 5000 } && draft.text.length <= 5000)
            when (problem.type) {
                1, 2, 3, 6 -> require(draft.options.isNotEmpty() && draft.options.size <= problem.maximum && draft.options.distinct().size == draft.options.size && draft.options.all { answer -> problem.options.any { it.key == answer } }) { "请手动选择有效答案。" }
                4 -> require(draft.options.size == maxOf(1, problem.blanks) && draft.options.all { it.isNotBlank() }) { "请手动填写所有空白。" }
                5 -> require(draft.text.isNotBlank()) { "请手动填写回答。" }
            }
        }
        is RainAction.Export -> require(action.slides.isNotEmpty() && action.slides.all { it in action.presentation.slides && it.image.isNotBlank() })
    }
}
internal fun rainRequest(host: RainHost, path: String, body: JsonObject? = null, bearer: String = "", uid: String = "", csrf: String = "", session: String = ""): Request {
    require(path.startsWith("/") && !path.startsWith("//"))
    val url = "https://${host.domain}$path".toHttpUrl(); require(url.host == host.domain && url.port == 443)
    return Request.Builder().url(url).header("User-Agent", "Android").header("Accept", "application/json").header("xtua", "client=app&tag=1.3.3&platform=Android").header("xtbz", "ykt").header("x-client", "app").apply {
        header("brand", "google Pixel 9 Pro"); header("uuid", ""); header("buildnumber", "1610")
        header("systemversion", "16"); header("incremental", "14624737"); header("isphysicaldevice", "true")
        if (uid.isNotBlank()) header("x-uid", uid)
        if (csrf.isNotBlank()) header("x-csrftoken", csrf)
        if (session.isNotBlank()) header("sessionid", session)
        if (bearer.isNotBlank()) header("Authorization", "Bearer $bearer")
        if (body != null) post(body.toString().toRequestBody("application/json".toMediaType()))
    }.build()
}
internal fun rainAnswerBody(action: RainAction.Answer, now: Long): JsonObject {
    rainValidate(action, now)
    val body = buildJsonObject {
        put("problemId", action.problem.id); put("problemType", action.problem.type); put("dt", if (action.retry) action.unlock.dt else now)
        put("result", if (action.problem.type == 5) buildJsonObject { put("content", action.draft.text); put("pics", buildJsonArray { add(buildJsonObject { put("pic", ""); put("thumb", "") }) }); put("videos", JsonArray(emptyList())) } else JsonArray(action.draft.options.map { JsonPrimitive(it) }))
        if (action.retry) put("retry_times", JsonNull)
    }
    return if (action.retry) buildJsonObject { put("problems", buildJsonArray { add(body) }) } else body
}
internal fun rainHello(lesson: RainLesson) = buildJsonObject { put("op", "hello"); put("userid", lesson.uid); put("role", "student"); put("auth", lesson.token); put("lessonid", lesson.id) }.toString()
internal fun rainLeave(lesson: RainLesson) = buildJsonObject { put("op", "leavelesson"); put("lessonid", lesson.id) }.toString()
internal suspend fun rainExportSlides(slides: List<RainSlide>, save: suspend (RainSlide) -> Unit, progress: (Int) -> Unit) {
    require(slides.isNotEmpty())
    slides.forEachIndexed { index, slide -> currentCoroutineContext().ensureActive(); save(slide); progress(index + 1) }
}
