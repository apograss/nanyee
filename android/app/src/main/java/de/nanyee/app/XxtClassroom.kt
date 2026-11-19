// Protocols adapted from AneryCoft/course_helper (GPL-3.0), lib/api/{quiz,topic_discuss,evaluate,pick}.dart.
package de.nanyee.app

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.isActive
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.jsoup.Jsoup

internal val xxtClassroomWrites = setOf(43, 14, 42, 5, 23)
@Serializable internal data class XxtOption(val key: String, val text: String)
@Serializable internal data class XxtQuestion(val id: String, val type: Int, val text: String, val required: Boolean, val options: List<XxtOption> = emptyList(), val blanks: Int = 0, val supported: Boolean = true)
@Serializable internal data class XxtNorm(val text: String, val maximum: Int)
@Serializable internal data class XxtReply(val author: String, val text: String, val time: String)
@Serializable internal data class XxtClassPage(val title: String, val text: String = "", val questions: List<XxtQuestion> = emptyList(), val norms: List<XxtNorm> = emptyList(), val topicUuid: String = "", val replies: List<XxtReply> = emptyList(), val submitted: Boolean = false, val writable: Boolean = false, val notice: String = "")
@Serializable internal data class XxtClassDraft(val answers: Map<String, List<String>> = emptyMap(), val text: String = "", val scores: List<String> = emptyList(), val total: String = "")
internal data class XxtClassSubmission(val user: XxtUser, val course: XxtCourse, val activity: XxtActivity, val page: XxtClassPage, val draft: XxtClassDraft)
@Serializable internal enum class XxtClassResult { SUCCESS, REJECTED, UNKNOWN }
internal enum class XxtClassStage { EDIT, CONFIRM, WRITING, SUCCESS, REJECTED, UNKNOWN }
internal class XxtClassFlow {
    var stage = XxtClassStage.EDIT; private set
    var confirmation: XxtClassSubmission? = null; private set
    fun preview(value: XxtClassSubmission, now: Long) {
        check(stage !in setOf(XxtClassStage.WRITING, XxtClassStage.SUCCESS, XxtClassStage.UNKNOWN))
        xxtValidateClassroom(value, now); confirmation = value; stage = XxtClassStage.CONFIRM
    }
    fun dismiss() { check(stage in setOf(XxtClassStage.EDIT, XxtClassStage.CONFIRM, XxtClassStage.REJECTED)); confirmation = null; stage = XxtClassStage.EDIT }
    fun begin(now: Long): XxtClassSubmission {
        check(stage == XxtClassStage.CONFIRM)
        val value = requireNotNull(confirmation); xxtValidateClassroom(value, now)
        confirmation = null; stage = XxtClassStage.WRITING; return value
    }
    fun finish(result: XxtClassResult) {
        check(stage == XxtClassStage.WRITING)
        stage = when (result) { XxtClassResult.SUCCESS -> XxtClassStage.SUCCESS; XxtClassResult.REJECTED -> XxtClassStage.REJECTED; XxtClassResult.UNKNOWN -> XxtClassStage.UNKNOWN }
    }
}
internal data class XxtPickStatus(val count: Int, val ongoing: Boolean)
internal class XxtPickTracker {
    private var count = 0
    fun observe(status: XxtPickStatus): Boolean { val alert = status.count > count; count = status.count; return alert }
}
internal fun xxtPickVisible(activity: XxtActivity?, resumed: Boolean) = resumed && activity?.type == 11 && activity.ongoing
internal suspend fun xxtPollPicked(read: suspend () -> XxtPickStatus, update: (XxtPickStatus) -> Unit, pause: suspend () -> Unit = { delay(3000) }) {
    while (currentCoroutineContext().isActive) {
        val status = read(); currentCoroutineContext().ensureActive(); update(status)
        if (!status.ongoing) return
        pause()
    }
}
internal interface XxtClassroomBackend {
    suspend fun classroom(course: XxtCourse, activity: XxtActivity, user: XxtUser): XxtClassPage
    suspend fun submitClassroom(submission: XxtClassSubmission): XxtClassResult
    suspend fun picked(activity: XxtActivity, uid: String): XxtPickStatus
}
internal fun xxtPlain(html: String): String {
    val document = Jsoup.parseBodyFragment(html)
    document.select("script,style,iframe,object").remove()
    document.select("img,video,audio,svg,math").forEach { it.after(" [图片/公式/媒体，请使用官方学习通查看] "); it.remove() }
    return document.text().take(20000)
}
private fun xxtHasMedia(html: String) = Jsoup.parseBodyFragment(html).select("img,video,audio,svg,math").isNotEmpty()
internal fun xxtParseQuestions(activity: XxtActivity, data: JsonObject): XxtClassPage {
    val rows = data["questionlist"] as? JsonArray ?: throw XxtFailure("FORMAT", "题目格式有变，请使用官方学习通。")
    require(rows.size <= 200)
    val questions = rows.map { item ->
        val row = item.jsonObject; val type = row.text("type").toIntOrNull() ?: -1
        val choice = type in setOf(0, 1, 3, 16)
        val answers = row["answer"] as? JsonArray ?: JsonArray(emptyList())
        val options = if (choice) answers.map { option -> val obj = option.jsonObject; XxtOption(obj.text("name"), xxtPlain(obj.text("content"))) } else emptyList()
        val blanks = if (activity.type == 42 && type == 2) answers.size else 0
        val known = when (activity.type) { 43 -> type in setOf(0, 16); 14 -> type in setOf(0, 1, 4, 16); 42 -> type in setOf(0, 1, 2, 3, 4, 5, 6, 7, 16); else -> false }
        val media = xxtHasMedia(row.text("content")) || (choice && answers.any { xxtHasMedia(it.jsonObject.text("content")) })
        val valid = row.text("id").isNotBlank() && (!choice || (options.isNotEmpty() && options.all { it.key.isNotBlank() } && options.distinctBy { it.key }.size == options.size)) && (type != 2 || blanks in 1..50)
        XxtQuestion(row.text("id"), type, xxtPlain(row.text("content")), activity.type != 14 || row.number("ismust") == 1, options, blanks, known && valid && !media)
    }
    val supported = questions.isNotEmpty() && questions.all { it.supported } && questions.distinctBy { it.id }.size == questions.size && (activity.type != 43 || questions.size == 1)
    val submitted = data["pptUserAttend"]?.let { it != JsonNull } == true || rows.any { it.jsonObject["studentAnswer"]?.let { answer -> answer != JsonNull } == true }
    return XxtClassPage(activity.name, questions = questions, submitted = submitted, writable = supported && !submitted,
        notice = if (!supported) "包含空题目、不支持的题型或图片/公式/媒体，仅供只读查看，请在官方学习通作答。" else if (submitted) "当前账号已提交。" else "所有答案均须手动输入，不显示或采用服务端参考答案。")
}
internal fun xxtParseTopic(activity: XxtActivity, topic: JsonObject, replies: JsonObject): XxtClassPage {
    val data = topic["data"] as? JsonObject ?: throw XxtFailure("FORMAT", "讨论格式有变。")
    val rows = (replies["data"] as? JsonObject)?.get("list") as? JsonArray ?: throw XxtFailure("FORMAT", "讨论回复格式有变。")
    return XxtClassPage(xxtPlain(data.text("title")).ifBlank { activity.name }, xxtPlain(data.text("text_content")), topicUuid = data.text("uuid"),
        replies = rows.take(100).map { val row = it.jsonObject; XxtReply(xxtPlain(row.text("creater_name")), xxtPlain(row.text("content")), xxtPlain(row.text("ftime"))) }, writable = data.text("uuid").isNotBlank(), notice = "显示默认一页回复（最多 100 条）；刷新可重新读取。实名回复，仅当前本人账号。")
}
internal fun xxtParseRating(activity: XxtActivity, data: JsonObject): XxtClassPage {
    if (data["normList"]?.let { it != JsonNull && it !is JsonArray } == true) throw XxtFailure("FORMAT", "评分标准格式有变。")
    val rows = data["normList"] as? JsonArray ?: JsonArray(emptyList())
    require(rows.size <= 100)
    val norms = rows.map { val row = it.jsonObject; XxtNorm(xxtPlain(row.text("content")), row.text("score").toIntOrNull() ?: -1) }
    val valid = norms.all { it.maximum in 1..1000000 }
    return XxtClassPage(activity.name, xxtPlain(data.text("content")), norms = norms, writable = valid, notice = if (!valid) "评分标准格式不支持，仅供只读查看。" else if (norms.isEmpty()) "请手动填写 0–100 的总分。" else "请逐项手动评分；总分为各项之和。")
}
internal fun xxtParsePicked(data: JsonObject, uid: String): XxtPickStatus {
    if (data.text("result") == "0") return XxtPickStatus(0, true)
    if (data.text("result") != "1") throw XxtFailure("FORMAT", "无法读取选人状态。")
    val content = data["data"] as? JsonObject ?: throw XxtFailure("FORMAT", "选人格式有变。")
    val rows = content["userListChoose"] as? JsonArray ?: throw XxtFailure("FORMAT", "选人格式有变。")
    return XxtPickStatus(rows.count { it.jsonObject.text("userId") == uid }, content.number("status") == 1)
}
internal fun xxtQuizRequest(activity: XxtActivity): Request = xxtRequest("$XXT_MOBILE/v2/apis/quiz/quizDetail", mapOf("activeId" to activity.id))
internal fun xxtTopicRequest(reply: Boolean, uid: String, id: String, device: String, stamp: Long): Request {
    val fields = if (reply) linkedMapOf("puid" to uid, "uuid" to id, "maxW" to "1080", "lastValue" to "", "lastAuxValue" to "", "order" to "0") else linkedMapOf("puid" to uid, "maxW" to "1080", "topicId" to id)
    return xxtRequest("https://groupyd.chaoxing.com/apis/${if (reply) "invitation/getReplys2" else "topic/getTopic"}", xxtSigned(emptyMap(), device, stamp)).newBuilder().post(FormBody.Builder().apply { fields.forEach { (k, v) -> add(k, v) } }.build()).build()
}
internal fun xxtRatingRequest(course: XxtCourse, activity: XxtActivity) = xxtRequest("$XXT_MOBILE/v2/apis/score/getStuScoreDetail", mapOf("activeId" to activity.id, "classId" to course.classId, "courseId" to course.id))
internal fun xxtPickRequest(activity: XxtActivity, stamp: Long) = xxtRequest("$XXT_MOBILE/widget/webcache/pick/stu/pickAttend", mapOf("activeId" to activity.id, "qasort" to "0", "screenMode" to "0", "webCacheId" to activity.id, "_" to stamp.toString()))
internal fun xxtValidateClassroom(value: XxtClassSubmission, now: Long) {
    val (user, _, activity, page, draft) = value
    require(user.uid.isNotBlank() && activity.type in xxtClassroomWrites && activity.ongoing && (activity.end == 0L || activity.end > now)) { "活动已结束或不可提交。" }
    require(page.writable && !page.submitted) { "当前活动仅供只读查看。" }
    require(draft.text.length <= 5000)
    when (activity.type) {
        43, 14, 42 -> {
            require(page.questions.isNotEmpty() && page.questions.all { it.supported })
            require(draft.answers.keys.all { key -> page.questions.any { it.id == key } })
            page.questions.forEach { question ->
                val answers = draft.answers[question.id].orEmpty()
                require(answers.all { it.length <= 5000 })
                if (question.required) require(answers.isNotEmpty() && answers.all { it.isNotBlank() }) { "请完成所有必答题。" }
                if (answers.isNotEmpty()) when (question.type) {
                    0, 1, 3, 16 -> { require(answers.distinct().size == answers.size && answers.all { answer -> question.options.any { it.key == answer } }); if (question.type != 1) require(answers.size == 1) }
                    2 -> require(answers.size == question.blanks)
                    else -> require(answers.size == 1)
                }
            }
        }
        5 -> require(page.topicUuid.isNotBlank() && draft.text.isNotBlank()) { "请先填写回复内容。" }
        23 -> if (page.norms.isEmpty()) require(draft.total.toIntOrNull()?.let { it in 0..100 } == true) { "请输入 0–100 的评分。" } else {
            require(draft.scores.size == page.norms.size)
            page.norms.forEachIndexed { i, norm -> require(draft.scores[i].toIntOrNull()?.let { it in 0..norm.maximum } == true) { "请填写各项有效评分。" } }
        }
    }
}
internal fun xxtClassroomRequest(value: XxtClassSubmission, stamp: Long, nonce: String): Request {
    xxtValidateClassroom(value, stamp)
    val (user, course, activity, page, draft) = value
    val base = linkedMapOf("courseId" to course.id, "classId" to course.classId, "activeId" to activity.id)
    return when (activity.type) {
        43 -> xxtRequest("$XXT_MOBILE/widget/quickvote/doQuestion", base + mapOf("questionId" to page.questions.single().id, "option" to draft.answers.getValue(page.questions.single().id).single()), true)
        14 -> {
            val form = FormBody.Builder().add("preventsubmit", "1").apply {
                base.forEach { (k, v) -> add(k, v) }
                page.questions.forEach { question -> val answers = draft.answers[question.id].orEmpty().filter { it.isNotBlank() }; if (answers.isNotEmpty()) { add("questionId", question.id); answers.forEach { add("answer${question.id}", it) } } }
            }.build()
            xxtRequest("$XXT_MOBILE/v2/apis/studentQuestion/doQuestion").newBuilder().post(form).build()
        }
        42 -> {
            val body = JsonArray(page.questions.map { question -> buildJsonObject {
                put("id", question.id); put("type", question.type)
                put("personAnswer", buildJsonObject {
                    val answers = draft.answers[question.id].orEmpty()
                    when (question.type) {
                        0, 1, 3, 16 -> put("myoption", question.options.filter { it.key in answers }.joinToString("") { it.key })
                        2 -> put("blankAnswer", JsonArray(answers.map { buildJsonObject { put("content", it) } }))
                        else -> { put("content", answers.single()); put("imgs", JsonArray(emptyList())); put("recs", JsonArray(emptyList())) }
                    }
                })
            } }).toString()
            xxtRequest("$XXT_MOBILE/v2/apis/studentQuestion/doQuestionAnswering", base + mapOf("DB_STRATEGY" to "PRIMARY_KEY", "STRATEGY_PARA" to "activeId")).newBuilder().post(body.toRequestBody("application/json".toMediaType())).build()
        }
        5 -> {
            val fields = linkedMapOf("puid" to user.uid, "uuid" to nonce, "maxW" to "1080", "topicUUID" to page.topicUuid, "anonymous" to "0")
            xxtRequest("https://groupyd.chaoxing.com/apis/invitation/addReply", xxtSigned(fields, nonce.replace("-", ""), stamp)).newBuilder().post(FormBody.Builder().add("content", draft.text).build()).build()
        }
        23 -> {
            val scores = if (page.norms.isEmpty()) emptyList() else draft.scores.map { it.toInt() }
            xxtRequest("$XXT_MOBILE/v2/apis/score/stuSubmitAnswer", base + mapOf("score" to if (page.norms.isEmpty()) draft.total else scores.sum().toString(), "scoreList" to JsonArray(scores.map { JsonPrimitive(it) }).toString(), "content" to draft.text), true)
        }
        else -> error("Read-only activity")
    }
}
internal fun xxtClassResult(data: JsonObject): XxtClassResult = when (data.text("result")) { "1", "true" -> XxtClassResult.SUCCESS; "0", "false", "-1" -> XxtClassResult.REJECTED; else -> XxtClassResult.UNKNOWN }
