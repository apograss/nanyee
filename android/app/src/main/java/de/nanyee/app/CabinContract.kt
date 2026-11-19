package de.nanyee.app

import kotlinx.serialization.json.*
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.*
import java.util.UUID

internal val cabinZone: ZoneId = ZoneId.of("Asia/Shanghai")

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

internal class CabinSubmission(val body: JsonObject, val key: String = UUID.randomUUID().toString()) {
    suspend fun send(backend: PlatformBackend): JsonElement = backend.call("POST", "/jobs", body, key)
}

internal fun platformRequest(method: String, path: String, body: JsonObject?, csrf: String?, key: String? = null): Request {
    require(path.matches(Regex("/(auth/(login|me|logout)|study-cabin/cabins|credentials(/[a-zA-Z0-9-]+(/secret)?)?|jobs(/[a-zA-Z0-9-]+/cancel)?)")))
    val builder = Request.Builder().url("https://nanyee.de/api/v1$path")
    if (method != "GET") {
        if (path != "/auth/login") {
            check(!csrf.isNullOrEmpty()) { "请重新登录平台账号。" }
            builder.header("X-CSRF-Token", csrf)
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

internal fun JsonElement.objectList(): List<JsonObject> = (this as? JsonArray)?.mapNotNull { it as? JsonObject } ?: error("响应格式无效")
