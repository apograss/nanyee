package de.nanyee.app

import androidx.compose.runtime.*
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.*
import java.time.Instant

internal class AccountRecovery(val read: (String) -> String?, val write: (String, String) -> Unit)

internal class AccountModel(private val backend: PlatformBackend, private val recovery: AccountRecovery, private val dismissed: (String) -> Set<String> = { emptySet() }, private val saveDismissed: (String, Set<String>) -> Unit = { _, _ -> }) {
    var user by mutableStateOf<JsonObject?>(null); private set
    var credentials by mutableStateOf(emptyList<JsonObject>()); private set
    var jobs by mutableStateOf(emptyList<JsonObject>()); private set
    var notices by mutableStateOf(emptyList<JsonObject>()); private set
    var job by mutableStateOf<JsonObject?>(null); private set
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf(""); private set
    var message by mutableStateOf(""); private set
    var revealed by mutableStateOf(""); private set
    var pending by mutableStateOf<AccountAction?>(null); private set
    var username by mutableStateOf("")
    var password by mutableStateOf("")
    var email by mutableStateOf("")
    var code by mutableStateOf("")
    var newPassword by mutableStateOf("")
    var schoolAccount by mutableStateOf("")
    var secret by mutableStateOf("")
    var ttlDays by mutableStateOf("180")
    var editing by mutableStateOf(""); private set
    var route by mutableStateOf(recovery.read("route") ?: ""); private set
    var challenge by mutableStateOf(recovery.read("challenge")?.let { runCatching { accountChallenge(Json.parseToJsonElement(it)) }.getOrNull() }); private set
    private var challengeOwner = recovery.read("challengeOwner").orEmpty()
    private var hidden = emptySet<String>()
    private var visibility = 0
    private val owner get() = user?.text("id").orEmpty()

    fun navigate(value: String) {
        if (busy) return
        clearTransient(); route = value; recovery.write("route", value)
        if (value !in setOf("email", "reset")) clearChallenge()
    }
    fun clearTransient() { visibility++; password = ""; newPassword = ""; secret = ""; schoolAccount = ""; code = ""; pending = null; revealed = ""; editing = "" }
    private fun clearChallenge() { challenge = null; challengeOwner = ""; recovery.write("challenge", ""); recovery.write("challengeOwner", "") }
    fun dismissConfirmation() { pending = null }
    fun hideSecret() { revealed = "" }
    private fun clearAccount() { user = null; credentials = emptyList(); jobs = emptyList(); notices = emptyList(); job = null; hidden = emptySet(); clearTransient() }
    private suspend fun run(block: suspend () -> Unit) {
        if (busy) return
        busy = true; error = ""; message = ""
        try { block() }
        catch (e: CancellationException) { throw e }
        catch (e: PlatformFailure) {
            if (e.status == 401) { clearAccount(); if (route != "reset") { route = ""; recovery.write("route", ""); clearChallenge() } }
            error = accountFailureMessage(e)
        }
        catch (_: Exception) { error = "操作未完成，网络或响应可能异常。如已提交，请刷新核对后再操作，勿重复提交。" }
        finally { busy = false }
    }
    suspend fun refresh() = run {
        val profile = platformUser(backend.call("GET", "/auth/me"))
        val nextOwner = profile.text("id"); require(nextOwner.isNotBlank())
        if (owner != nextOwner) { clearAccount(); hidden = dismissed(nextOwner) }
        user = profile
        if (route == "email" && challengeOwner != nextOwner) clearChallenge()
        load()
    }
    private suspend fun load() {
        credentials = accountRows(backend.call("GET", "/credentials"))
        jobs = accountRows(backend.call("GET", "/jobs"))
        notices = accountRows(backend.call("GET", "/notices")).filterNot { it.text("id") in hidden }
        val jobId = recovery.read("jobId").orEmpty()
        if (route == "job" && jobId.isNotEmpty()) job = backend.call("GET", "/jobs/${accountId(jobId)}") as? JsonObject ?: error("响应格式无效")
    }
    suspend fun openJob(id: String) = run {
        require(user != null); val value = backend.call("GET", "/jobs/${accountId(id)}") as? JsonObject ?: error("响应格式无效")
        require(value.text("id") == id); job = value; route = "job"; recovery.write("route", route); recovery.write("jobId", id)
    }
    fun dismissNotice(id: String) {
        if (user == null || notices.none { it.text("id") == id && (it["dismissible"] as? JsonPrimitive)?.booleanOrNull == true }) return
        hidden = hidden + id; saveDismissed(owner, hidden); notices = notices.filterNot { it.text("id") == id }
    }
    fun editCredential(id: String) { if (!busy) { clearTransient(); editing = credentials.firstOrNull { it.text("id") == id }?.text("id").orEmpty() } }
    private fun valid(condition: Boolean, hint: String) { if (!condition) throw IllegalArgumentException(hint) }
    fun review(kind: AccountWrite, id: String = "") {
        if (busy || pending != null) return
        error = ""; revealed = ""
        try {
            if (kind !in setOf(AccountWrite.LOGIN, AccountWrite.RESET_CODE, AccountWrite.RESET_CONFIRM)) valid(user != null, "请先登录 Nanyee。")
            pending = when (kind) {
                AccountWrite.LOGIN -> {
                    valid(username.length in 2..24 && password.length in 1..128, "请填写平台用户名及密码。")
                    AccountAction(kind, "/auth/login", body = accountPayload("username" to username, "password" to password)).also { password = "" }
                }
                AccountWrite.LOGOUT -> AccountAction(kind, "/auth/logout")
                AccountWrite.EMAIL_CODE, AccountWrite.RESET_CODE -> {
                    valid(email.length <= 254 && email.matches(Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")), "请填写有效邮箱。")
                    valid(challenge?.canResend() != false, "请等待验证码重发时间。")
                    val bound = kind == AccountWrite.EMAIL_CODE && !user?.text("email").isNullOrBlank()
                    valid(!bound || password.length in 1..128, "换绑需要当前平台密码。")
                    val body = if (bound) accountPayload("email" to email, "password" to password) else accountPayload("email" to email)
                    AccountAction(kind, if (kind == AccountWrite.EMAIL_CODE) "/account/email/challenges" else "/account/password-reset", body = body).also { password = "" }
                }
                AccountWrite.EMAIL_CONFIRM, AccountWrite.RESET_CONFIRM -> {
                    val current = challenge
                    valid(current != null && !current.expired(), "验证码已过期，请重新发送。")
                    valid(code.matches(Regex("[0-9]{6}")), "请输入六位验证码。")
                    if (kind == AccountWrite.RESET_CONFIRM) valid(newPassword.length in 8..128, "新密码须为 8–128 字符。")
                    val body = if (kind == AccountWrite.RESET_CONFIRM) accountPayload("challenge_id" to current!!.id, "code" to code, "new_password" to newPassword) else accountPayload("challenge_id" to current!!.id, "code" to code)
                    AccountAction(kind, if (kind == AccountWrite.EMAIL_CONFIRM) "/account/email/confirm" else "/account/password-reset/confirm", body = body).also { code = ""; newPassword = "" }
                }
                AccountWrite.EMAIL_UNBIND -> {
                    valid(password.length in 1..128, "解绑需要当前平台密码。")
                    AccountAction(kind, "/account/email/unbind", body = accountPayload("password" to password)).also { password = "" }
                }
                AccountWrite.CANCEL -> { valid(jobs.any { it.text("id") == id }, "请刷新任务列表。"); AccountAction(kind, "/jobs/${accountId(id)}/cancel") }
                else -> {
                    val row = credentials.firstOrNull { it.text("id") == id } ?: error("凭据不存在")
                    val body = when (kind) {
                        AccountWrite.UPDATE -> {
                            val purpose = row.text("purpose")
                            valid(purpose in setOf("school", "evaluation", "study_cabin", "qun_checkin"), "此凭据类型请在网页修改。")
                            valid(secret.isNotBlank() && secret.length <= 4096, "请填写新的托管秘密。")
                            val value = if (purpose == "qun_checkin") secret else {
                                valid(schoolAccount.isNotBlank() && schoolAccount.length <= 64 && secret.length <= 256, "请填写原学校账号及新密码。")
                                accountPayload("account" to schoolAccount, "password" to secret).toString()
                            }
                            accountPayload("secret" to value)
                        }
                        AccountWrite.RENEW -> {
                            valid(row["expires_at"] != null && row["expires_at"] != JsonNull, "永久凭据无需续期。")
                            val days = ttlDays.toIntOrNull(); valid(days != null && days in 1..365, "有效期须为 1–365 天。")
                            accountPayload("ttl_seconds" to days!! * 86400)
                        }
                        else -> null
                    }
                    accountCredentialAction(kind, id, body).also { secret = ""; schoolAccount = ""; editing = "" }
                }
            }
        } catch (e: IllegalArgumentException) { error = e.message ?: "输入不完整。" }
        catch (_: Exception) { error = "无法继续，请刷新列表后重试。" }
    }
    suspend fun confirm() {
        val action = pending ?: return
        if (busy) return
        val visible = visibility
        pending = null
        run {
            val result = backend.call(action.method, action.path, action.body)
            when (action.kind) {
                AccountWrite.LOGIN -> { clearAccount(); user = platformUser(result); hidden = dismissed(owner); route = ""; recovery.write("route", ""); clearChallenge(); load() }
                AccountWrite.LOGOUT -> { backend.clearLocal(); clearAccount(); route = ""; recovery.write("route", ""); clearChallenge(); message = "已退出 Nanyee；学校登录不受影响。" }
                AccountWrite.EMAIL_CODE, AccountWrite.RESET_CODE -> {
                    challenge = accountChallenge(result); challengeOwner = if (action.kind == AccountWrite.EMAIL_CODE) owner else ""
                    recovery.write("challenge", result.toString()); recovery.write("challengeOwner", challengeOwner)
                    message = "验证码已发送（若邮箱已绑定对应账号）。请查收并留意有效期。"
                }
                AccountWrite.EMAIL_CONFIRM, AccountWrite.EMAIL_UNBIND -> { user = platformUser(result); clearChallenge(); message = "邮箱设置已更新。" }
                AccountWrite.RESET_CONFIRM -> { backend.clearLocal(); clearAccount(); clearChallenge(); route = ""; recovery.write("route", ""); message = "密码已重置，所有平台会话均已退出，请重新登录。" }
                AccountWrite.REVEAL -> { val value = (result as? JsonObject)?.text("secret").orEmpty(); require(value.isNotEmpty()); if (visible == visibility) revealed = value }
                else -> { load(); message = "操作已提交，请核对更新后的状态。" }
            }
        }
    }
}
