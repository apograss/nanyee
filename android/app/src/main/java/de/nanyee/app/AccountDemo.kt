package de.nanyee.app

import androidx.compose.runtime.*
import kotlinx.serialization.json.*
import java.time.Instant

internal enum class AccountDemoFailure(val label: String) { NONE("成功"), REJECTED("校验失败"), SESSION("登录过期"), CHALLENGE("网页验证"), NETWORK("网络失败"), EMPTY("空列表") }

internal class DemoAccountBackend(initiallySignedIn: Boolean = false) : PlatformBackend {
    var failure by mutableStateOf(AccountDemoFailure.NONE)
    private var signedIn = initiallySignedIn
    fun selectScenario(value: AccountDemoFailure) { failure = value; signedIn = true }
    private var email: String? = "demo@example.invalid"
    private var requestedEmail = ""
    private var demoUsername = "demo"
    private var demoNickname = "演示同学"
    private var registration: JsonObject? = null
    private var registrationVerified = false
    private var credentialRows = listOf(
        accountPayload("id" to "demo-school", "purpose" to "school", "upstream" to "school", "status" to "active", "expires_at" to JsonNull, "metadata" to accountPayload("account_hint" to "尾号 1234", "credential_kind" to "password")),
        accountPayload("id" to "demo-token", "purpose" to "qun_checkin", "upstream" to "qun100", "status" to "active", "expires_at" to "2030-12-01T00:00:00Z"),
        accountPayload("id" to "demo-revoked", "purpose" to "evaluation", "upstream" to "academic", "status" to "revoked", "expires_at" to JsonNull)
    )
    private var jobRows = listOf(
        accountPayload("id" to "demo-job", "tool_id" to "evaluation", "state" to "queued", "operation" to "evaluate", "attempt_count" to 0, "created_at" to "2026-11-19T00:00:00Z", "updated_at" to "2026-11-19T00:00:00Z", "receipt" to accountPayload("logs" to JsonArray(listOf(accountPayload("message" to "离线演示：等待执行"))))),
        accountPayload("id" to "demo-failed-job", "tool_id" to "study_cabin", "state" to "failed", "operation" to "reserve", "attempt_count" to 3, "created_at" to "2026-11-19T00:00:00Z", "updated_at" to "2026-11-19T00:05:00Z", "receipt" to accountPayload("message" to "离线演示失败回执"), "error_code" to "UPSTREAM_UNAVAILABLE")
    )
    private fun profile() = accountPayload("user" to accountPayload("id" to "demo-user", "username" to demoUsername, "nickname" to demoNickname, "email" to (email?.let(::JsonPrimitive) ?: JsonNull), "email_verified" to (email != null), "role" to "user"), "csrf_header" to platformCsrfHeader)
    private fun challenge(): JsonObject = accountPayload("challenge_id" to "demo-challenge", "expires_at" to Instant.now().plusSeconds(600).toString(), "resend_at" to Instant.now().plusSeconds(60).toString(), "masked_email" to "d***@example.invalid")
    private fun registrationChallenge(body: JsonObject?): JsonObject {
        val expires = "expires_at" to Instant.now().plusSeconds(1800).toString()
        if (body?.text("method") == "email") {
            requestedEmail = body.text("email")
            return accountPayload("challenge_id" to "demo-registration", "method" to "email", expires, "resend_at" to Instant.now().plusSeconds(60).toString(), "masked_email" to "d***@smu.edu.cn")
        }
        val questions = listOf("演示题：南方医科大学位于哪个城市？" to listOf("北京", "广州", "上海"), "演示题：本 App 的课表来自？" to listOf("手动输入", "教务系统", "随机生成"), "演示题：答对几题可以注册？" to listOf("全部", "按页面提示", "不用答"))
        return accountPayload("challenge_id" to "demo-registration", "method" to "quiz", expires, "questions" to JsonArray(questions.map { (q, options) -> accountPayload("question" to q, "options" to JsonArray(options.map(::JsonPrimitive))) }), "total_questions" to 3, "pass_score" to 2)
    }
    override suspend fun clearLocal() { signedIn = false }
    override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
        when (failure) {
            AccountDemoFailure.REJECTED -> throw PlatformFailure(422, "INVALID_REQUEST", "演示：信息校验失败。")
            AccountDemoFailure.SESSION -> { signedIn = false; throw PlatformFailure(401, "AUTHENTICATION_REQUIRED", "演示：登录已过期。") }
            AccountDemoFailure.CHALLENGE -> throw PlatformFailure(429, "RATE_LIMIT_CHALLENGE_REQUIRED", "演示：需要网页验证。")
            AccountDemoFailure.NETWORK -> throw PlatformFailure(0, "NETWORK", "演示：网络失败，请先核对操作是否生效。")
            else -> Unit
        }
        if (method == "POST" && path == "/auth/login") { signedIn = true; return profile() }
        if (path == "/registration/challenges") return registrationChallenge(body).also { registration = it; registrationVerified = false }
        if (path.startsWith("/registration/challenges/") && path.endsWith("/verify")) {
            val current = registration ?: throw PlatformFailure(404, "NOT_FOUND", "演示", "注册验证不存在。")
            require(path == "/registration/challenges/${current.text("challenge_id")}/verify")
            val passed = if (current.text("method") == "quiz") {
                val score = (body?.get("answers") as? JsonArray).orEmpty().count { it.jsonPrimitive.intOrNull == 1 }
                if (score < 2) throw PlatformFailure(422, "INVALID_REQUEST", "演示", "验证未通过。", accountPayload("attempts_remaining" to 4, "score" to score, "required_score" to 2))
                true
            } else body?.text("code") == "123456"
            if (!passed) throw PlatformFailure(422, "INVALID_REQUEST", "演示", "验证未通过。", accountPayload("attempts_remaining" to 4))
            registrationVerified = true
            return accountPayload("verified" to true, "attempts_remaining" to 4)
        }
        if (method == "POST" && path == "/registration") {
            val current = registration
            if (current == null || !registrationVerified || body?.text("challenge_id") != current.text("challenge_id")) throw PlatformFailure(422, "INVALID_REQUEST", "演示", "注册验证无效或已过期。")
            val name = body.text("username")
            if (name.equals("demo", ignoreCase = true)) throw PlatformFailure(409, "CONFLICT", "演示", "用户名或邮箱已被使用。")
            demoUsername = name; demoNickname = body.text("nickname").ifBlank { name }
            email = if (current.text("method") == "email") requestedEmail else null
            registration = null; registrationVerified = false; signedIn = true
            return profile()
        }
        if (path == "/account/password-reset") return challenge()
        if (path == "/account/password-reset/confirm") { require(body?.text("code") == "123456"); signedIn = false; return JsonNull }
        if (!signedIn) throw PlatformFailure(401, "AUTHENTICATION_REQUIRED", "请登录演示平台账号。")
        return when {
            path == "/auth/me" -> profile()
            path == "/auth/logout" -> { signedIn = false; JsonNull }
            path == "/account/email/challenges" -> { requestedEmail = body?.text("email").orEmpty(); challenge() }
            path == "/account/email/confirm" -> { require(body?.text("code") == "123456"); email = requestedEmail; profile() }
            path == "/account/email/unbind" -> { email = null; profile() }
            path == "/credentials" -> JsonArray(if (failure == AccountDemoFailure.EMPTY) emptyList() else credentialRows)
            path.startsWith("/credentials/") -> {
                val id = path.substringAfter("/credentials/").substringBefore('/').substringBefore('?')
                val row = credentialRows.first { it.text("id") == id }
                when {
                    path.endsWith("/reveal") -> accountPayload("secret" to "demo-only-secret-not-real")
                    path.endsWith("?hard=true") -> { credentialRows = credentialRows.filterNot { it.text("id") == id }; JsonNull }
                    else -> {
                        val updated = JsonObject(row + when {
                            path.endsWith("/renew") -> mapOf("expires_at" to JsonPrimitive(Instant.now().plusSeconds(body?.get("ttl_seconds")?.jsonPrimitive?.long ?: 0).toString()))
                            method == "DELETE" -> mapOf("status" to JsonPrimitive("revoked"))
                            path.endsWith("/secret") && body?.get("metadata") != null -> mapOf("metadata" to body.getValue("metadata"))
                            else -> emptyMap()
                        })
                        credentialRows = credentialRows.map { if (it.text("id") == id) updated else it }; updated
                    }
                }
            }
            path == "/jobs" -> JsonArray(if (failure == AccountDemoFailure.EMPTY) emptyList() else jobRows)
            path.startsWith("/jobs/") -> {
                val id = path.substringAfter("/jobs/").substringBefore('/')
                if (path.endsWith("/cancel")) jobRows = jobRows.map { if (it.text("id") == id) JsonObject(it + ("state" to JsonPrimitive("cancelled"))) else it }
                jobRows.first { it.text("id") == id }
            }
            path == "/notices" -> JsonArray(if (failure == AccountDemoFailure.EMPTY) emptyList() else listOf(
                accountPayload("id" to "demo-notice", "title" to "演示：自动评课已恢复", "message" to "这是离线提醒，可以在本机关闭。", "dismissible" to true),
                accountPayload("id" to "demo-warning", "title" to "演示：学校密码失效", "message" to "请在工具的授权流程或托管凭据中更新。", "dismissible" to false)
            ))
            else -> error("未实现的演示请求")
        }
    }
}
