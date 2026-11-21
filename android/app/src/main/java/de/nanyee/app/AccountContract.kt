package de.nanyee.app

import kotlinx.serialization.json.*
import java.time.Instant

internal fun accountPayload(vararg fields: Pair<String, Any?>) = buildJsonObject {
    fields.forEach { (key, value) -> put(key, when (value) { null -> JsonNull; is JsonElement -> value; is Number -> JsonPrimitive(value); is Boolean -> JsonPrimitive(value); else -> JsonPrimitive(value.toString()) }) }
}

internal enum class AccountWrite(val label: String) {
    LOGIN("登录 Nanyee"), LOGOUT("退出 Nanyee"), EMAIL_CODE("发送邮箱验证码"), EMAIL_CONFIRM("确认绑定邮箱"), EMAIL_UNBIND("解绑邮箱，失去邮件找回功能"), RESET_CODE("发送找回密码验证码"), RESET_CONFIRM("重置密码并退出所有平台会话"), UPDATE("更新托管秘密，可能恢复关联任务"), RENEW("延长凭据有效期"), REVOKE("撤销凭据，影响关联任务"), DELETE("永久删除凭据并取消关联任务，不可恢复"), REVEAL("在屏幕显示托管秘密，请避开旁人"), CANCEL("取消任务")
}

internal class AccountAction(val kind: AccountWrite, val path: String, val method: String = "POST", val body: JsonObject? = null)
internal data class AccountChallenge(val id: String, val expires: String, val resend: String, val maskedEmail: String) {
    fun expired(now: Instant = Instant.now()) = runCatching { !now.isBefore(platformInstant(expires)) }.getOrDefault(true)
    fun canResend(now: Instant = Instant.now()) = runCatching { !now.isBefore(platformInstant(resend)) }.getOrDefault(true)
}

internal fun accountChallenge(value: JsonElement): AccountChallenge {
    val row = value as? JsonObject ?: error("响应格式无效")
    val id = row.text("challenge_id"); require(id.matches(Regex("[a-zA-Z0-9-]+")))
    platformInstant(row.text("expires_at")); platformInstant(row.text("resend_at"))
    return AccountChallenge(id, row.text("expires_at"), row.text("resend_at"), row.text("masked_email"))
}

internal fun accountRows(value: JsonElement): List<JsonObject> = value.objectList().onEach { require(it.text("id").isNotBlank()) }
internal fun accountId(value: String): String { require(value.matches(Regex("[a-zA-Z0-9-]+"))); return value }
internal fun accountCredentialAction(kind: AccountWrite, id: String, body: JsonObject? = null): AccountAction {
    val base = "/credentials/${accountId(id)}"
    return when (kind) {
        AccountWrite.UPDATE -> AccountAction(kind, "$base/secret", "PUT", body)
        AccountWrite.RENEW -> AccountAction(kind, "$base/renew", body = body)
        AccountWrite.REVOKE -> AccountAction(kind, base, "DELETE")
        AccountWrite.DELETE -> AccountAction(kind, "$base?hard=true", "DELETE")
        AccountWrite.REVEAL -> AccountAction(kind, "$base/reveal")
        else -> error("不支持的凭据操作")
    }
}

internal fun accountPurpose(value: String) = when (value) { "school" -> "学校统一认证"; "evaluation" -> "自动评课"; "study_cabin" -> "自习舱预约"; "qun_checkin" -> "群报数"; else -> value }
internal fun accountStatus(value: String) = when (value) { "active" -> "有效"; "revoked" -> "已撤销"; "expired" -> "已过期"; "deleted" -> "已删除"; else -> value }
internal fun accountJobDetails(row: JsonObject) =
    "${row.text("operation")} · ${row.text("state")}\n创建：${row.text("created_at")}\n更新：${row.text("updated_at")}\n尝试：${row.text("attempt_count")}\n错误：${row.text("error_code")}\n后续：${row.text("next_action")}"

internal fun accountReceipt(value: JsonElement): String {
    fun redact(node: JsonElement): JsonElement = when (node) {
        is JsonObject -> JsonObject(node.mapValues { (key, child) -> if (listOf("password", "secret", "token", "cookie", "authorization", "session").any { key.contains(it, true) }) JsonPrimitive("[隐藏]") else redact(child) })
        is JsonArray -> JsonArray(node.map(::redact))
        else -> node
    }
    return if (value == JsonNull) "暂无回执" else redact(value).toString().take(24000)
}

internal fun accountFailureMessage(error: PlatformFailure): String = when {
    error.code in setOf("RATE_LIMIT_CHALLENGE_REQUIRED", "TURNSTILE_REQUIRED", "ANTI_ABUSE_REQUIRED") -> "请在网页完成验证：https://nanyee.de"
    error.status == 401 -> "平台登录已过期或凭据不正确，请重新登录。"
    error.status == 422 -> "信息未通过校验，请核对邮箱、验证码、密码或有效期。"
    error.status == 409 -> "状态冲突，请刷新后核对；不要重复提交。"
    else -> error.message.orEmpty().ifBlank { "操作失败，请刷新核对后重试。" }
}
