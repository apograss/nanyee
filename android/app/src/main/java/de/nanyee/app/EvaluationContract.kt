package de.nanyee.app

import kotlinx.serialization.json.*
import org.jsoup.Jsoup
import okhttp3.Request
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.time.LocalDate
import java.time.OffsetDateTime
import kotlin.random.Random

internal data class EvaluationReference(val teacher: String, val hour: String, val questionnaire: String, val teacherName: String = "", val courseName: String = "", val endDate: String = "") {
    val key get() = listOf(teacher, hour, questionnaire).joinToString("|")
    fun validate() { require(listOf(teacher, hour, questionnaire).all { it.matches(Regex("[A-Za-z0-9_.:-]{1,128}")) }) }
}
internal data class EvaluationOption(val code: String, val score: Int, val label: String)
internal data class EvaluationQuestion(val type: Int, val indicator: String, val title: String, val options: List<EvaluationOption>)
internal data class EvaluationDraft(val reference: EvaluationReference, val hidden: Map<String, String>, val questions: List<EvaluationQuestion>)
internal data class EvaluationPreview(val draft: EvaluationDraft, val selections: Map<String, String>)

internal interface EvaluationSource {
    suspend fun pending(): List<EvaluationReference>
    suspend fun draft(reference: EvaluationReference): EvaluationDraft
    suspend fun submit(preview: EvaluationPreview): Int
}

private const val EVALUATION_PAGE = "$ACADEMIC/new/student/ktpj"
private fun evaluationFormRequest(path: String, fields: Map<String, String>): Request {
    val form = FormBody.Builder().apply { fields.forEach { (name, value) -> add(name, value) } }.build()
    val buffer = okio.Buffer()
    form.writeTo(buffer)
    return Request.Builder().url("$EVALUATION_PAGE/$path").header("Origin", ACADEMIC).header("Referer", EVALUATION_PAGE)
        .header("X-Requested-With", "XMLHttpRequest")
        .post(buffer.readByteArray().toRequestBody("application/x-www-form-urlencoded; charset=UTF-8".toMediaType())).build()
}
internal fun evaluationPendingRequest(date: LocalDate): Request = evaluationFormRequest("xsktpjData", mapOf("jsrq" to date.toString(), "page" to "1", "rows" to "60", "sort" to "jsrq, jcdm2", "order" to "desc"))
    .newBuilder().header("Accept", "application/json, text/javascript, */*; q=0.01").build()
internal fun evaluationDraftRequest(reference: EvaluationReference): Request {
    reference.validate()
    val url = "$EVALUATION_PAGE/showXsktpjwj.page".toHttpUrl().newBuilder().addQueryParameter("pjlxdm", "6").addQueryParameter("teadm", reference.teacher).addQueryParameter("dgksdm", reference.hour).addQueryParameter("wjdm", reference.questionnaire).build()
    return Request.Builder().url(url).header("Accept", "text/html,*/*").header("Referer", EVALUATION_PAGE).build()
}
internal fun evaluationSubmitRequest(preview: EvaluationPreview): Request = evaluationFormRequest("savePj", evaluationSubmission(preview))

private fun boundedEvaluationText(value: String, limit: Int): String = value.replace(Regex("(?U)\\s+"), " ").trim().take(limit)
private fun JsonObject.evaluationText(key: String, limit: Int): String = boundedEvaluationText(text(key), limit)

internal fun pendingEvaluations(value: JsonElement): List<EvaluationReference> {
    val rows = (value as? JsonObject)?.get("rows") as? JsonArray ?: error("评课列表格式无效")
    return rows.mapNotNull { raw ->
        val row = raw as? JsonObject ?: return@mapNotNull null
        if (row.text("pjdm").isNotEmpty() && row["pjdm"] != JsonPrimitive(0) && row["pjdm"] != JsonPrimitive(false)) return@mapNotNull null
        val ref = EvaluationReference(row.evaluationText("teadm", 128), row.evaluationText("dgksdm", 128), row.evaluationText("ktpj", 128), row.evaluationText("teaxm", 100), row.evaluationText("kcmc", 200), row.evaluationText("jsrq", 32))
        ref.takeIf { it.teacher.isNotEmpty() && it.hour.isNotEmpty() && it.questionnaire.isNotEmpty() }
    }.distinctBy { it.key }
}

internal fun evaluationDraft(html: String, reference: EvaluationReference): EvaluationDraft {
    reference.validate()
    val doc = Jsoup.parse(html)
    val script = doc.select("script").firstOrNull { "entss.post" in it.data() }?.data().orEmpty()
    val fields = Regex("(\\w+)\\s*:\\s*['\"]([^'\"]*)['\"]").findAll(script).filter { it.groupValues[1].length <= 64 && it.groupValues[2].length <= 500 }.associate { it.groupValues[1] to it.groupValues[2] }
    val required = setOf("xnxqdm", "pjlxdm", "teaxm", "kcrwdm", "kcptdm", "kcdm", "jxhjdm")
    require(fields.keys.containsAll(required) && fields.getOrDefault("teadm", reference.teacher) == reference.teacher && fields.getOrDefault("wjdm", reference.questionnaire) == reference.questionnaire) { "评课表单已失效或未开放" }
    val questions = doc.select("div.question").take(100).mapNotNull { node ->
        val indicator = boundedEvaluationText(node.attr("data-zbdm"), 128)
        val type = node.attr("data-txdm").toIntOrNull() ?: 0
        val raty = node.selectFirst("div.raty")
        val values = raty?.attr("data-wtxm")?.takeIf { it.length <= 20000 }?.let { runCatching { Json.parseToJsonElement(it) as? JsonArray }.getOrNull() }
        val options = if (!values.isNullOrEmpty()) {
            val full = raty!!.attr("data-fz").toDoubleOrNull()?.takeIf { it.isFinite() } ?: 0.0
            values.take(20).mapIndexedNotNull { index, raw ->
                val item = raw as? JsonObject ?: return@mapIndexedNotNull null
                val code = item.evaluationText("zbxmdm", 128)
                if (code.isEmpty()) null else EvaluationOption(code, Math.rint(full * (index + 1) / values.size).toInt().coerceIn(0, 100), boundedEvaluationText(item.text("zbxmmc").ifEmpty { item.text("mc") }.ifEmpty { code }, 100))
            }
        } else if (type == 3) emptyList() else node.select("input[type=radio]").take(20).mapNotNull { input ->
            val code = boundedEvaluationText(input.attr("value"), 128)
            val label = boundedEvaluationText(input.attr("data-mc"), 100).ifEmpty { boundedEvaluationText(input.parents().firstOrNull { it.tagName() == "label" }?.text().orEmpty(), 100) }.ifEmpty { code }
            if (code.isEmpty()) null else EvaluationOption(code, Math.rint(input.attr("data-fz").toDoubleOrNull()?.takeIf { it.isFinite() } ?: 0.0).toInt().coerceIn(0, 100), label)
        }
        options.distinctBy { it.code }.takeIf { indicator.isNotEmpty() && it.isNotEmpty() }?.let { EvaluationQuestion(type, indicator, boundedEvaluationText(node.selectFirst("h3")?.text().orEmpty(), 500), it) }
    }.distinctBy { it.indicator }
    require(questions.isNotEmpty()) { "评课尚未开放或表单无法读取" }
    return EvaluationDraft(reference.copy(teacherName = fields.getValue("teaxm").take(100), courseName = fields["kcmc"].orEmpty().ifEmpty { fields.getValue("kcdm") }.take(200)), fields.filterKeys { it in required }, questions)
}

internal fun evaluationAnswers(draft: EvaluationDraft, random: Random = Random.Default): Map<String, String> {
    val profile = listOf(listOf(0, 0, 1, 1), listOf(0, 1, 1, 2), listOf(1, 1, 1, 1), listOf(0, 1, 1, 1)).random(random).shuffled(random)
    var index = 0
    return draft.questions.associate { question ->
        val scored = question.options.filter { it.score > 0 }.sortedByDescending { it.score }
        val option = if (scored.isEmpty()) question.options.last() else scored[profile[index++ % profile.size].coerceAtMost(scored.lastIndex)]
        question.indicator to option.code
    }
}

internal fun evaluationSubmission(preview: EvaluationPreview): Map<String, String> {
    val draft = preview.draft
    draft.reference.validate()
    require(preview.selections.keys == draft.questions.map { it.indicator }.toSet())
    var total = 0
    val answers = draft.questions.map { q ->
        val option = q.options.firstOrNull { it.code == preview.selections[q.indicator] } ?: error("评课选项已失效")
        total += option.score
        buildJsonObject {
            put("txdm", q.type); put("zbdm", q.indicator); put("zbmc", q.title); put("zbxmdm", option.code); put("fz", option.score)
            put("dtjg", if (q.type == 5) "★".repeat(q.options.indexOf(option) + 1) else option.label)
        }
    }
    return draft.hidden + mapOf("teadm" to draft.reference.teacher, "teabh" to draft.reference.teacher, "wjdm" to draft.reference.questionnaire, "dgksdm" to draft.reference.hour, "wtpf" to total.toString(), "pfsm" to "", "dt" to JsonArray(answers).toString())
}

internal fun evaluationResult(text: String): Boolean {
    val parsed = runCatching { Json.parseToJsonElement(text) }.getOrNull()
    val unquotedText = parsed is JsonPrimitive && !parsed.isString && parsed != JsonNull && parsed.booleanOrNull == null && parsed.doubleOrNull == null
    if (parsed == null || unquotedText) return text.isNotBlank() && "成功" in text && "失败" !in text
    val obj = parsed as? JsonObject ?: return false
    return obj["success"] == JsonPrimitive(true) || obj.text("code") == "0"
}

internal fun evaluationJob(credential: String, maxCourses: Int, retryUntil: String): JsonObject {
    require(maxCourses in 1..60)
    if (retryUntil.isNotBlank()) require(OffsetDateTime.parse(retryUntil).toInstant().isAfter(java.time.Instant.now()))
    return buildJsonObject {
        put("tool_id", "evaluation"); put("operation", "submit"); put("credential_id", credential); put("confirmation_version", "evaluation:submit:v1")
        putJsonObject("payload") { put("strategy", "legacy_positive_random"); put("max_courses", maxCourses); if (retryUntil.isNotBlank()) put("retry_until", retryUntil) }
    }
}
