package de.nanyee.app

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.security.MessageDigest

internal class AccountState(app: Application, private val saved: SavedStateHandle) : AndroidViewModel(app) {
    var demo by mutableStateOf(saved.get<Boolean>("accountDemo") ?: false); private set
    var model by mutableStateOf<AccountModel?>(null); private set
    var initializationError by mutableStateOf(""); private set
    val fixture = DemoAccountBackend()
    private var work: Job? = null
    private val preferences = app.getSharedPreferences("account_ui", 0)
    private val models = mutableMapOf<Boolean, AccountModel>()
    private fun key(owner: String) = "dismissed." + MessageDigest.getInstance("SHA-256").digest(owner.toByteArray()).joinToString("") { "%02x".format(it) }
    fun open(forceDemo: Boolean = false) {
        if (forceDemo && !demo) {
            work?.cancel(); clearTransient(); demo = true; saved["accountDemo"] = true; model = null
        }
        if (work?.isActive == true) return
        initializationError = ""
        val mode = demo
        work = viewModelScope.launch {
            try {
                model = models[mode] ?: AccountModel(
                    if (mode) fixture else withContext(Dispatchers.IO) { PlatformSession.api(getApplication()) },
                    AccountRecovery({ saved.get<String>("account.$mode.$it") }, { name, value -> saved["account.$mode.$name"] = value }),
                    { owner -> if (mode) emptySet() else preferences.getStringSet(key(owner), emptySet()).orEmpty().toSet() },
                    { owner, ids -> if (!mode) preferences.edit().putStringSet(key(owner), ids).apply() }
                ).also { models[mode] = it }
                model?.refresh()
            } catch (e: CancellationException) { throw e } catch (_: Exception) { initializationError = "无法打开平台加密会话，请重试。" }
        }
    }
    fun switchDemo() {
        if (model?.busy == true || work?.isActive == true) return
        model?.clearTransient(); demo = !demo; saved["accountDemo"] = demo; model = null; open()
    }
    fun confirm() { val current = model ?: return; viewModelScope.launch { current.confirm() } }
    fun job(id: String) { val current = model ?: return; viewModelScope.launch { current.openJob(id) } }
    fun clearTransient() { models.values.forEach { it.clearTransient() } }
    override fun onCleared() { clearTransient() }
}
