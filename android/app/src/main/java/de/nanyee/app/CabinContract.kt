package de.nanyee.app

import kotlinx.serialization.json.*
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.*
import java.util.UUID

internal val cabinZone: ZoneId = ZoneId.of("Asia/Shanghai")
internal const val platformCsrfHeader = "X-CSRF-Token"

internal fun platformUser(value: JsonElement): JsonObject {
    val response = value as? JsonObject ?: error("平台账号响应格式无效")
    require(response.text("csrf_header").ifEmpty { platformCsrfHeader } == platformCsrfHeader) { "平台 CSRF 协议不受支持" }
    return (response["user"] as? JsonObject)?.takeIf { it.isNotEmpty() } ?: error("平台账号响应缺少用户")
}

internal fun cabinCredentials(value: JsonElement): List<JsonObject> = value.objectList().filter {
    it.text("purpose") == "study_cabin" && it.text("upstream") == "infospace" && it.text("status") == "active"
}

internal fun cabinJobs(value: JsonElement): List<JsonObject> = value.objectList().filter { it.text("tool_id") == "study_cabin" }

internal data class CabinDraft(
    val date: String,
    val start: String = "09:00",
    val end: String = "11:00",
    val title: String = "学习",
    val cabins: List<Int> = emptyList(),
    val scheduled: String,
    val until: String
)

internal fun cabinDefaults(now: ZonedDateTime = ZonedDateTime.now(cabinZone)): CabinDraft {
    val local = now.withZoneSameInstant(cabinZone)
    val date = local.toLocalDate().plusDays(1)
    return CabinDraft(date.toString(), scheduled = local.withSecond(0).withNano(0).toOffsetDateTime().toString(), until = date.atTime(8, 50).atZone(cabinZone).toOffsetDateTime().toString())
}

internal fun validateCabin(draft: CabinDraft, available: Set<Int>, now: Instant = Instant.now()): String? = try {
    val date = LocalDate.parse(draft.date)
    val start = LocalTime.parse(draft.start)
    val end = LocalTime.parse(draft.end)
    val duration = Duration.between(start, end).seconds
    val scheduled = OffsetDateTime.parse(draft.scheduled).toInstant()
    val until = OffsetDateTime.parse(draft.until).toInstant()
    when {
        draft.title.codePointCount(0, draft.title.length) !in 1..30 -> "标题需要 1–30 个字符。"
        start.minute % 10 != 0 || end.minute % 10 != 0 || start.second != 0 || end.second != 0 || start.nano != 0 || end.nano != 0 -> "时间须为 10 分钟整点。"
        duration !in 1800L..14400L -> "预约时长须为 30–240 分钟。"
        start < LocalTime.of(8, 0) || end > LocalTime.of(22, 50) -> "开放时间为 08:00–22:50。"
        draft.cabins.size !in 1..18 || draft.cabins.distinct().size != draft.cabins.size || draft.cabins.any { it !in available } -> "请选择 1–18 个不重复的可用舱位。"
        until > date.atTime(start).atZone(cabinZone).toInstant() -> "停止尝试时间不能晚于预约开始。"
        scheduled > now.plus(Duration.ofDays(30)) -> "首次尝试最多提前计划 30 天。"
        until <= now || scheduled >= until -> "尝试窗口已结束或首次尝试不早于停止时间。"
        else -> null
    }
} catch (_: Exception) { "请填写有效日期、时间及带时区的尝试时间。" }

internal fun cabinJob(draft: CabinDraft, credentialId: String): JsonObject = buildJsonObject {
    put("tool_id", "study_cabin"); put("operation", "reserve"); put("credential_id", credentialId)
    put("confirmation_version", "study_cabin:reserve:v1"); put("scheduled_for", draft.scheduled)
    putJsonObject("payload") {
        put("target_date", draft.date); put("start_time", draft.start); put("end_time", draft.end)
        put("title", draft.title); put("attempt_until", draft.until)
        putJsonArray("cabin_ids") { draft.cabins.forEach { add(it) } }
    }
}

internal fun cabinSecret(account: String, password: String, create: Boolean): JsonObject = buildJsonObject {
    put("secret", payload("account" to account, "password" to password).toString())
    putJsonObject("metadata") { put("account_hint", "尾号 ${if (account.length > 4) account.takeLast(4) else "*".repeat(account.length.coerceAtLeast(1))}") }
    if (create) {
        put("upstream", "infospace"); put("purpose", "study_cabin"); put("consent_version", "credential-hosting-v1")
    }
}

internal class CabinSubmission(val body: JsonObject, val key: String = UUID.randomUUID().toString(), private val now: () -> Instant = Instant::now) {
    private var firstSentAt: Instant? = null
    suspend fun send(backend: PlatformBackend): JsonElement {
        if (firstSentAt == null) firstSentAt = now()
        return backend.call("POST", "/jobs", body, key)
    }
    fun validation(available: Set<Int>, now: Instant = Instant.now()): String? {
        val p = body["payload"]!!.jsonObject
        return validateCabin(CabinDraft(p.text("target_date"), p.text("start_time"), p.text("end_time"), p.text("title"),
            p["cabin_ids"]!!.jsonArray.map { it.jsonPrimitive.int }, body.text("scheduled_for"), p.text("attempt_until")), available, now)
    }
    fun matchingJob(jobs: List<JsonObject>): JsonObject? {
        val sent = firstSentAt ?: return null
        val earliest = sent.minusSeconds(120)
        return jobs.firstOrNull {
            val created = runCatching { Instant.parse(it.text("created_at")) }.getOrNull()
            val terminal = it.text("state") in setOf("succeeded", "failed", "cancelled")
            val updated = runCatching { Instant.parse(it.text("updated_at")) }.getOrNull()
            created != null && !created.isBefore(earliest) &&
                (!terminal || (updated != null && !updated.isBefore(earliest))) &&
                sameCabinPayload(it["payload"], body["payload"]) && it["credential_id"] == body["credential_id"] && it["operation"] == body["operation"]
        }
    }
}

private fun sameCabinPayload(first: JsonElement?, second: JsonElement?): Boolean = runCatching {
    val a = first!!.jsonObject
    val b = second!!.jsonObject
    listOf("target_date", "title", "cabin_ids").all { a[it] == b[it] } &&
        listOf("start_time", "end_time").all { LocalTime.parse(a.text(it)) == LocalTime.parse(b.text(it)) } &&
        OffsetDateTime.parse(a.text("attempt_until")).toInstant() == OffsetDateTime.parse(b.text("attempt_until")).toInstant()
}.getOrDefault(false)

internal class CabinCredentialRecovery {
    private var baseline: Set<String>? = null

    suspend fun save(backend: PlatformBackend, body: JsonObject): JsonObject {
        val current = cabinCredentials(backend.call("GET", "/credentials"))
        if (baseline != null) current.firstOrNull { it.text("id") !in baseline!! }?.let {
            baseline = null
            return it
        }
        baseline = current.map { it.text("id") }.toSet()
        val result = backend.call("POST", "/credentials", body).obj()
        baseline = null
        return result
    }
}

internal fun cabinAccountMatchesHint(account: String, hint: String): Boolean {
    val suffix = Regex("[A-Za-z0-9]{4}$").find(hint.trim())?.value ?: return false
    return account.trim().length in 4..64 && account.trim().takeLast(4) == suffix
}

internal suspend fun updateCabinPassword(backend: PlatformBackend, id: String, account: String, password: String, hint: String) {
    require(cabinAccountMatchesHint(account, hint)) { "学号与原凭据提示不符或提示无法核对。更换账号请先撤销原凭据，再创建新凭据。" }
    backend.call("PUT", "/credentials/$id/secret", payload("secret" to payload("account" to account, "password" to password).toString()))
}

internal fun platformRequest(method: String, path: String, body: JsonObject?, csrf: String?, key: String? = null): Request {
    require(path.matches(Regex("/(auth/(login|me|logout)|study-cabin/cabins|credentials(/[a-zA-Z0-9-]+(/secret)?)?|jobs(/[a-zA-Z0-9-]+/cancel)?)")))
    val builder = Request.Builder().url("https://nanyee.de/api/v1$path")
    if (method != "GET") {
        if (path != "/auth/login") {
            check(!csrf.isNullOrEmpty()) { "请重新登录平台账号。" }
            builder.header(platformCsrfHeader, csrf)
        }
        if (method == "DELETE") builder.delete() else builder.method(method, (body ?: JsonObject(emptyMap())).toString().toRequestBody("application/json".toMediaType()))
    }
    key?.let { builder.header("Idempotency-Key", it) }
    return builder.build()
}

internal fun cabinStatus(state: String): String = when (state) {
    "queued" -> "等待预约"; "running" -> "正在尝试"; "retry_wait" -> "等待重试"
    "succeeded" -> "预约成功"; "failed" -> "预约失败"; "cancelled" -> "已取消"
    "verification_required" -> "需要核验"; else -> "未知状态"
}

internal fun cabinNextAction(action: String): String = when (action) {
    "verify_upstream" -> "结果不确定，请到学校预约网站核验；不要重复预约。"
    "replace_credential" -> "请更新托管的学校凭据。"
    "automatic_retry" -> "服务器将自动重试，请稍候。"
    else -> "请到 nanyee.de 查看任务并核验预约结果。"
}

internal fun JsonElement.objectList(): List<JsonObject> = (this as? JsonArray)?.map { it as? JsonObject ?: error("响应列表项格式无效") } ?: error("响应格式无效")
