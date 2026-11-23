package de.nanyee.app

import kotlinx.serialization.json.*
import java.time.Instant
import java.time.OffsetDateTime

internal fun platformInstant(value: String): Instant = runCatching { Instant.parse(value) }.getOrElse { OffsetDateTime.parse(value).toInstant() }

internal enum class RegistrationMethod(val wire: String, val label: String, val offered: Boolean = true) { QUICK("quick", "快速注册"), EMAIL("email", "教育邮箱"), QUIZ("quiz", "校内答题", offered = false) }

internal data class RegistrationQuestion(val question: String, val options: List<String>)

internal data class RegistrationChallenge(val id: String, val method: RegistrationMethod, val expires: String, val maskedEmail: String = "", val resend: String = "", val questions: List<RegistrationQuestion> = emptyList(), val passScore: Int = 0) {
    fun expired(now: Instant = Instant.now()) = runCatching { !now.isBefore(platformInstant(expires)) }.getOrDefault(true)
    fun canResend(now: Instant = Instant.now()) = resend.isBlank() || runCatching { !now.isBefore(platformInstant(resend)) }.getOrDefault(true)
}

internal fun registrationChallenge(value: JsonElement): RegistrationChallenge {
    val row = value as? JsonObject ?: error("响应格式无效")
    val id = row.text("challenge_id"); require(id.matches(Regex("[a-zA-Z0-9-]+")))
    val method = RegistrationMethod.entries.first { it.wire == row.text("method") }
    platformInstant(row.text("expires_at"))
    val questions = (row["questions"] as? JsonArray).orEmpty().map { item ->
        val question = item as? JsonObject ?: error("题目格式无效")
        val options = (question["options"] as? JsonArray ?: error("题目缺少选项")).map { it.jsonPrimitive.content }
        require(question.text("question").isNotBlank() && options.size >= 2)
        RegistrationQuestion(question.text("question"), options)
    }
    if (method != RegistrationMethod.EMAIL) require(questions.isNotEmpty())
    val pass = (row["pass_score"] as? JsonPrimitive)?.intOrNull ?: questions.size
    return RegistrationChallenge(id, method, row.text("expires_at"), row.text("masked_email"), row.text("resend_at"), questions, pass)
}

internal val registrationUsernamePattern = Regex("[A-Za-z0-9_]{2,24}")

internal fun registrationFailureMessage(error: PlatformFailure): String {
    val details = error.details
    val remaining = (details["attempts_remaining"] as? JsonPrimitive)?.intOrNull
    val score = (details["score"] as? JsonPrimitive)?.intOrNull
    val required = (details["required_score"] as? JsonPrimitive)?.intOrNull
    return when {
        score != null && required != null -> "答对 $score 题，需答对 $required 题。" + if (remaining == 0) "次数已用完，请换一套题。" else "还可再交 ${remaining ?: 0} 次。"
        remaining != null -> "验证码不正确。" + if (remaining == 0) "次数已用完，请重新发送。" else "还可再试 $remaining 次。"
        error.code == "RATE_LIMIT_CHALLENGE_REQUIRED" || error.code == "HUMAN_VERIFICATION_FAILED" -> "注册太频繁，请稍后重试。"
        registrationRestartNeeded(error) -> error.serverMessage.ifBlank { "注册验证已失效。" } + "已为你重新开始。"
        error.status == 429 -> "请求过于频繁，请稍后再试。"
        error.status in setOf(409, 422) && error.serverMessage.isNotBlank() -> error.serverMessage
        else -> accountFailureMessage(error)
    }
}

internal fun registrationRestartNeeded(error: PlatformFailure): Boolean =
    error.status in setOf(404, 410) || (error.details["attempts_remaining"] as? JsonPrimitive)?.intOrNull == 0 ||
        error.serverMessage.contains("重新开始") || error.serverMessage.contains("注册验证")
