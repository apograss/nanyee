package de.nanyee.app

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.serialization.json.*

internal class CabinState(app: Application) : AndroidViewModel(app) {
    private var backend: PlatformBackend? = null
    private var work: Job? = null
    private var initialized = false
    private var generation = 0
    private var credentialRecovery = CabinCredentialRecovery()
    var demo by mutableStateOf(false); private set
    var busy by mutableStateOf(false); private set
    var user by mutableStateOf<JsonObject?>(null); private set
    var error by mutableStateOf(""); private set
    var message by mutableStateOf(""); private set
    var username by mutableStateOf("")
    var platformPassword by mutableStateOf("")
    var account by mutableStateOf("")
    var schoolPassword by mutableStateOf("")
    var consent by mutableStateOf(false); private set
    var credentialEditor by mutableStateOf(false); private set
    var editingId by mutableStateOf<String?>(null); private set
    var credentials by mutableStateOf(emptyList<JsonObject>()); private set
    var selectedCredential by mutableStateOf("")
    var cabins by mutableStateOf(emptyList<JsonObject>()); private set
    var jobs by mutableStateOf(emptyList<JsonObject>()); private set
    var draft by mutableStateOf(cabinDefaults())
    var confirmation by mutableStateOf<CabinSubmission?>(null); private set
    var pending by mutableStateOf<CabinSubmission?>(null); private set
    var canDiscardPending by mutableStateOf(false); private set
    var submitted by mutableStateOf(false); private set

    private suspend fun api(): PlatformBackend = backend ?: withContext(Dispatchers.IO) {
        if (demo) DemoCabinBackend() else PlatformApi(EncryptedPlatformCookies(getApplication()))
    }.also { backend = it }

    private fun run(action: suspend () -> Unit) {
        if (busy) return
        busy = true; error = ""; message = ""
        val current = generation
        work = viewModelScope.launch {
            try { action() }
            catch (e: CancellationException) { throw e }
            catch (e: PlatformFailure) {
                if (e.status == 401) clearSensitive()
                error = e.message.orEmpty()
            } catch (_: Exception) { error = "操作未完成，请检查网络或重试；如已提交，请先刷新我的预约核对。" }
            finally { if (generation == current) busy = false }
        }
    }

    fun open(demoMode: Boolean) {
        if (initialized && demo == demoMode) return
        generation++; work?.cancel(); busy = false; clearSensitive(); backend = null; username = ""
        demo = demoMode; initialized = true; draft = cabinDefaults(); error = ""; message = ""
        run { user = platformUser(api().call("GET", "/auth/me")); load() }
    }

    private fun clearSensitive() {
        credentialRecovery = CabinCredentialRecovery()
        user = null; platformPassword = ""; account = ""; schoolPassword = ""; credentials = emptyList()
        selectedCredential = ""; jobs = emptyList(); cabins = emptyList(); consent = false; credentialEditor = false
        editingId = null; confirmation = null; pending = null; submitted = false; canDiscardPending = false
        draft = cabinDefaults()
    }

    fun login() {
        if (username.length !in 2..24 || platformPassword.length !in 1..128) { error = "平台用户名为 2–24 字符，密码为 1–128 字符。"; return }
        val body = payload("username" to username, "password" to platformPassword)
        platformPassword = ""
        run { user = platformUser(api().call("POST", "/auth/login", body)); load() }
    }

    fun logout() = run {
        var remoteFailed = false
        try { api().call("POST", "/auth/logout") } catch (e: CancellationException) { throw e } catch (_: Exception) { remoteFailed = true }
        api().clearLocal()
        clearSensitive()
        message = if (remoteFailed) "已清除本机平台登录。服务器注销未确认，可到网站管理会话。" else "已退出平台账号并清除本机平台 Cookie。"
    }

    private suspend fun load() {
        credentials = cabinCredentials(api().call("GET", "/credentials"))
        if (credentials.none { it.text("id") == selectedCredential }) selectedCredential = credentials.firstOrNull()?.text("id").orEmpty()
        cabins = api().call("GET", "/study-cabin/cabins").objectList()
        jobs = cabinJobs(api().call("GET", "/jobs"))
    }

    fun refresh() = run { user = platformUser(api().call("GET", "/auth/me")); load() }

    fun editCredential(id: String? = null) {
        if (busy || pending != null) return
        credentialEditor = true; consent = false; editingId = id; account = ""; schoolPassword = ""
    }
    fun cancelCredential() { credentialEditor = false; consent = false; editingId = null; account = ""; schoolPassword = "" }
    fun agree(prefill: suspend () -> Pair<String, String>?) {
        consent = true
        run {
            val remembered = if (demo) "demo" to "demo-only" else prefill()
            account = remembered?.first.orEmpty(); schoolPassword = remembered?.second.orEmpty()
        }
    }
    fun saveCredential() {
        if (!consent || account.isBlank() || account.length > 64 || schoolPassword.isEmpty() || schoolPassword.length > 256) { error = "请同意托管，并填写学号（不超过 64 字符）与密码（不超过 256 字符）。"; return }
        val id = editingId
        val body = cabinSecret(account.trim(), schoolPassword, true)
        schoolPassword = ""
        run {
            selectedCredential = credentialRecovery.save(api(), body, id).text("id")
            cancelCredential(); load(); message = "凭据已安全提交给 nanyee.de。"
        }
    }
    fun revoke(id: String) = run { api().call("DELETE", "/credentials/$id"); load(); message = "已撤销托管凭据。" }

    fun review() {
        if (pending != null) { error = "上次提交尚未确认，请先使用原确认重试或刷新核对。"; return }
        error = validateCabin(draft, cabins.map { it.number("dev_id") }.toSet()).orEmpty()
        if (selectedCredential.isEmpty()) error = "请先选择托管凭据。"
        if (error.isEmpty()) confirmation = CabinSubmission(cabinJob(draft, selectedCredential))
    }
    fun dismissConfirmation() { confirmation = null }
    fun confirm() {
        val value = confirmation ?: return
        confirmation = null; pending = value; sendPending()
    }
    fun sendPending() {
        val value = pending ?: return
        canDiscardPending = false
        run {
            try { value.send(api()) }
            catch (e: PlatformFailure) {
                if (e.status in 400..499 && e.status !in listOf(409, 429) && e.code != "RATE_LIMIT_CHALLENGE_REQUIRED") pending = null
                throw e
            }
            pending = null; submitted = true
            load(); message = "预约任务已创建，服务器将按计划尝试。"
        }
    }
    fun reconcilePending() = run {
        val value = pending ?: return@run
        jobs = cabinJobs(api().call("GET", "/jobs"))
        if (value.matchingJob(jobs) != null) {
            pending = null; submitted = true; canDiscardPending = false
            message = "已找到相同预约，请在我的预约查看。"
        } else {
            canDiscardPending = true
            message = "当前列表未找到相同预约。可以明确放弃本机待确认请求；服务器可能仍在处理，请留意后续任务。"
        }
    }
    fun discardPending() {
        if (!busy && canDiscardPending) { pending = null; canDiscardPending = false }
    }
    fun newBooking() { if (pending == null) { submitted = false; draft = cabinDefaults() } }
    fun cancelJob(id: String) = run { api().call("POST", "/jobs/$id/cancel"); load() }
    fun advanceDemo(id: String, state: String) = run { (api() as? DemoCabinBackend)?.advance(id, state); load() }
}
