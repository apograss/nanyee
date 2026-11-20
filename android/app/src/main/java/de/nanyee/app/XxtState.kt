package de.nanyee.app

import android.app.Application
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.util.UUID

internal class XxtState(app: Application, private val savedState: SavedStateHandle) : AndroidViewModel(app) {
    private val storage: XxtStorage by lazy { EncryptedXxtStorage(getApplication()) }
    private var backend: XxtBackend? = null
    private var work: Job? = null
    private var draftWork: Job? = null
    private var smsCountdown: Job? = null
    private var qrLoggingIn = false
    var smsResendSeconds by mutableIntStateOf(classroomSmsResendSeconds(savedState.get<Long>("smsRetryAt") ?: 0, System.currentTimeMillis())); private set
    private var initialized = false
    private var generation = 0
    private var flow = XxtFlow()
    private var validateToken = ""
    private var pendingWrite = false
    private var classroomFlow = XxtClassFlow()
    private var pickWork: Job? = null
    private var pickTracker = XxtPickTracker()
    private var pickGeneration = 0
    var classroomPage by mutableStateOf<XxtClassPage?>(null); private set
    var classroomDraft by mutableStateOf(XxtClassDraft()); private set
    var classroomConfirmation by mutableStateOf<XxtClassSubmission?>(null); private set
    var classroomResult by mutableStateOf<XxtClassResult?>(null); private set
    var pickMonitoring by mutableStateOf(false); private set
    var pickMessage by mutableStateOf("等待前台监测…"); private set
    var pickAlert by mutableStateOf(false); private set
    var demo by mutableStateOf(false); private set
    var busy by mutableStateOf(false); private set
    var user by mutableStateOf<XxtUser?>(null); private set
    var courses by mutableStateOf(emptyList<XxtCourse>()); private set
    var activities by mutableStateOf(emptyList<XxtActivity>()); private set
    var course by mutableStateOf<XxtCourse?>(null); private set
    var activity by mutableStateOf<XxtActivity?>(null); private set
    var detail by mutableStateOf<XxtSignDetail?>(null); private set
    var code by mutableStateOf(""); private set
    var qr by mutableStateOf(""); private set
    var photoPath by mutableStateOf(""); private set
    var position by mutableStateOf<XxtPosition?>(null); private set
    var qrLogin by mutableStateOf<XxtQrLogin?>(null); private set
    var captcha by mutableStateOf<XxtCaptcha?>(null); private set
    var confirmation by mutableStateOf<XxtSignPlan?>(null); private set
    var error by mutableStateOf(""); private set
    var message by mutableStateOf(""); private set
    var loaded by mutableStateOf(false); private set
    val completed get() = pendingWrite || classroomResult == XxtClassResult.SUCCESS || flow.stage in setOf(XxtStage.UNKNOWN, XxtStage.SUCCESS)
    val hasUnknownWrite get() = pendingWrite
    private suspend fun api(): XxtBackend = backend ?: withContext(Dispatchers.IO) { if (demo) DemoXxtBackend() else XxtApi(storage) }.also { backend = it }
    private fun run(action: suspend () -> Unit) {
        if (busy) return
        busy = true; error = ""; monitorPick(false)
        val token = generation
        work = viewModelScope.launch {
            try { draftWork?.cancelAndJoin(); action() }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) {
                if (token == generation) {
                    error = when (e) { is XxtLocationFailure, is XxtFailure -> e.message.orEmpty(); is IllegalArgumentException, is IllegalStateException -> "无法继续，请检查输入并重新加载活动。"; else -> "学习通操作失败，请稍后重试。" }
                    if (pendingWrite) { message = "结果未知，请在官方学习通确认；不会自动重试。"; if (flow.stage == XxtStage.WRITING) flow.finish(XxtSignResult.Unknown) }
                }
            }
            finally { if (token == generation) busy = false }
        }
    }
    private suspend fun save() {
        val value = Json.encodeToString(XxtJournal(demo, course, activity, detail, code, photoPath, pendingWrite, classroomDraft, classroomResult))
        if (demo) savedState["draft"] = value else withContext(Dispatchers.IO) { storage.write("journal", value) }
    }
    private suspend fun <T> read(action: suspend () -> T): T = if (demo) action() else xxtReadRecover(
        credentials = { withContext(Dispatchers.IO) { storage.read("account") to storage.read("password") } },
        login = { account, password -> acceptLogin(api().login(account, password)) }, expired = { user = null }, action = action)
    private suspend fun acceptLogin(value: XxtUser) {
        if (!demo) {
            val previous = withContext(Dispatchers.IO) { storage.read("owner") }
            if (previous.isNotBlank() && previous != value.uid) { course = null; activity = null; detail = null; activities = emptyList(); resetSign(); save() }
            withContext(Dispatchers.IO) { storage.write("owner", value.uid) }
        }
        user = value
    }
    fun initialize(asDemo: Boolean) {
        if (initialized) return
        initialized = true; demo = asDemo
        resumeSmsCountdown()
        run {
                val journal = if (demo) savedState.get<String>("draft").orEmpty() else withContext(Dispatchers.IO) { storage.read("journal") }
                val restored = runCatching { Json.decodeFromString<XxtJournal>(journal) }.getOrNull()
                course = restored?.course; activity = restored?.activity; detail = restored?.detail; code = restored?.code.orEmpty(); photoPath = restored?.photo.orEmpty()
                pendingWrite = restored?.writePending == true
                classroomDraft = restored?.classroom ?: XxtClassDraft(); classroomResult = restored?.classroomResult
                if (pendingWrite) message = "上次操作被中断，结果未知，请先在官方学习通确认；不会恢复提交。"
                else if (classroomResult == XxtClassResult.SUCCESS) message = "上次课堂活动提交成功。"
                if (demo || withContext(Dispatchers.IO) { storage.read("active") } == "true") {
                    user = read { api().user() }; courses = read { api().courses() }; loaded = true
                    course?.let { activities = read { api().activities(it) } }
                    loadActivity()
                }
        }
    }
    fun login(account: String, password: String, remember: Boolean) = run {
        require(account.isNotBlank() && password.isNotBlank())
        acceptLogin(api().login(account, password))
        if (!demo) withContext(Dispatchers.IO) { storage.write("account", if (remember) account else ""); storage.write("password", if (remember) password else ""); storage.write("active", "true") }
        courses = api().courses(); loaded = true
    }
    private fun resumeSmsCountdown() {
        smsCountdown?.cancel()
        smsCountdown = viewModelScope.launch {
            do {
                smsResendSeconds = classroomSmsResendSeconds(savedState.get<Long>("smsRetryAt") ?: 0, System.currentTimeMillis())
                if (smsResendSeconds > 0) delay(1000)
            } while (smsResendSeconds > 0)
        }
    }
    fun sendSms(phone: String) = run {
        require(phone.matches(Regex("1[0-9]{10}")) && classroomSmsResendSeconds(savedState.get<Long>("smsRetryAt") ?: 0, System.currentTimeMillis()) == 0)
        savedState["smsRetryAt"] = System.currentTimeMillis() + 60000
        resumeSmsCountdown()
        api().sendSms(phone)
        message = if (demo) "演示：未发送真实短信，验证码为 123456。" else "验证码已发送，请查看短信。"
    }
    fun loginSms(phone: String, value: String) = run {
        require(phone.matches(Regex("1[0-9]{10}")) && value.matches(Regex("[0-9]{4,8}")))
        acceptLogin(api().loginSms(phone, value))
        if (!demo) withContext(Dispatchers.IO) { storage.write("account", ""); storage.write("password", ""); storage.write("active", "true") }
        courses = api().courses(); loaded = true
    }
    fun beginQrLogin() = run {
        qrLoggingIn = true
        val token = generation
        try {
            val backend = api()
            val result = renewingClassroomQr(backend.qrLogin(), backend::qrLogin, { qrLogin = it }) { qr ->
                try {
                    backend.pollQr(qr)?.let { ClassroomQrResult.Authorized(it) } ?: ClassroomQrResult.Waiting
                } catch (e: XxtFailure) {
                    if (e.kind == "QR_EXPIRED") ClassroomQrResult.Expired else throw e
                }
            }
            acceptLogin(result)
            if (!demo) withContext(Dispatchers.IO) { storage.write("account", ""); storage.write("password", ""); storage.write("active", "true") }
            qrLogin = null; courses = backend.courses(); loaded = true
        } finally { if (token == generation) { qrLogin = null; qrLoggingIn = false } }
    }
    fun stopQrLogin() { if (qrLoggingIn) { generation++; work?.cancel(); qrLoggingIn = false; qrLogin = null; busy = false } }
    fun refresh() = run {
        user = read { api().user() }; courses = read { api().courses() }; loaded = true
        course?.let { activities = read { api().activities(it) } }
        loadActivity()
    }
    fun selectCourse(value: XxtCourse) = run {
        resetSign(); activity = null; detail = null; course = value; activities = emptyList(); loaded = false; save()
        activities = read { api().activities(value) }; loaded = true
    }
    fun selectActivity(value: XxtActivity) = run {
        resetSign(); activity = value; detail = null; save()
        user = read { api().user() }
        loadActivity(); save()
    }
    private suspend fun loadActivity() {
        val selected = activity ?: return
        if (selected.type in setOf(2, 74)) detail = read { api().detail(selected) }
        else classroomPage = read { api().classroom(requireNotNull(course), selected, requireNotNull(user)) }
    }
    private fun resetSign() {
        discardPhoto()
        monitorPick(false); pickTracker = XxtPickTracker(); pickAlert = false; pickMessage = "等待前台监测…"
        classroomFlow = XxtClassFlow(); classroomPage = null; classroomDraft = XxtClassDraft(); classroomConfirmation = null; classroomResult = null
        flow = XxtFlow(); confirmation = null; captcha = null; code = ""; qr = ""; position = null; validateToken = ""; message = if (pendingWrite) "结果未知，请先在官方学习通核验；不会自动重试。" else ""
    }
    private fun discardPhoto() {
        if (photoPath.isNotBlank()) photoPath = xxtDiscardPhoto(photoPath, getApplication<Application>().filesDir, pendingWrite)
    }
    fun acknowledgeUnknown() = run {
        pendingWrite = false; resetSign(); save()
        message = "已解除本地未知结果标记；再次提交仍需预览确认。"
    }
    fun back() = run {
        if (activity != null) { activity = null; detail = null } else { course = null; activities = emptyList() }
        resetSign(); loaded = true; save()
    }
    fun updateCode(value: String) { if (!busy) { code = value.filter(Char::isDigit).take(20); confirmation = null; draftWork?.cancel(); draftWork = viewModelScope.launch { try { save() } catch (e: CancellationException) { throw e } catch (_: Exception) { error = "无法安全保存学习通草稿。" } } } }
    fun scanned(value: String) { if (!busy) { qr = value; confirmation = null } }
    fun locate() = run { position = xxtCurrentPosition(getApplication()); confirmation = null }
    fun importPhoto(uri: Uri) = run {
        check(!pendingWrite) { "请先核验上次结果。" }
        val replacement = withContext(Dispatchers.IO) {
            val bytes = getApplication<Application>().contentResolver.openInputStream(uri)?.use { input ->
                val output = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
                while (true) { val count = input.read(buffer); if (count < 0) break; require(output.size() + count <= 6 * 1024 * 1024); output.write(buffer, 0, count) }
                output.toByteArray()
            } ?: throw IllegalArgumentException()
            require(bytes.size in 1..6 * 1024 * 1024)
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            require(bounds.outWidth in 1..16000 && bounds.outHeight in 1..16000 && bounds.outWidth.toLong() * bounds.outHeight <= 40000000)
            val options = BitmapFactory.Options().apply { inSampleSize = 1; while (bounds.outWidth / inSampleSize > 2048 || bounds.outHeight / inSampleSize > 2048) inSampleSize *= 2 }
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: throw IllegalArgumentException()
            val file = File(getApplication<Application>().filesDir, "${if (demo) "xxt_demo_photo_" else "xxt_photo_"}${UUID.randomUUID()}.jpg")
            try { file.outputStream().use { check(bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 88, it)) } }
            catch (e: Exception) { file.delete(); throw e }
            finally { bitmap.recycle() }
            file.absolutePath
        }
        try { discardPhoto(); photoPath = replacement }
        catch (e: Exception) { File(replacement).delete(); throw e }
        confirmation = null; save()
    }
    private fun plan() = XxtSignPlan(requireNotNull(course), requireNotNull(activity), requireNotNull(detail), code, qr, photoPath, position)
    fun preview() = run {
        check(!pendingWrite) { "请先核验上次结果。" }
        user = read { api().user() }
        detail = read { api().detail(requireNotNull(activity)) }
        flow.preview(plan(), System.currentTimeMillis()); save()
        if (flow.stage == XxtStage.CAPTCHA) captcha = api().captcha(requireNotNull(flow.plan)) else confirmation = flow.plan
    }
    fun verifyCaptcha(x: Int) = run {
        val token = api().solveCaptcha(requireNotNull(captcha), x, requireNotNull(flow.plan))
        flow.verified(token); validateToken = token; captcha = null; confirmation = flow.plan
    }
    fun reloadCaptcha() = run { captcha = api().captcha(requireNotNull(flow.plan)) }
    fun dismissConfirmation() { confirmation = null }
    fun dismissCaptcha() { captcha = null; flow.dismiss() }
    fun updateClassroom(value: XxtClassDraft) {
        if (busy || completed) return
        classroomDraft = value; classroomFlow.dismiss(); classroomConfirmation = null; classroomResult = null
        draftWork?.cancel()
        draftWork = viewModelScope.launch {
            delay(250)
            try { save() } catch (e: CancellationException) { throw e } catch (_: Exception) { error = "无法安全保存课堂活动草稿。" }
        }
    }
    fun previewClassroom() = run {
        check(!completed)
        user = read { api().user() }; loadActivity()
        val value = XxtClassSubmission(requireNotNull(user), requireNotNull(course), requireNotNull(activity), requireNotNull(classroomPage), classroomDraft)
        classroomFlow.preview(value, System.currentTimeMillis()); classroomConfirmation = value; save()
    }
    fun dismissClassroomConfirmation() { if (!busy) { classroomFlow.dismiss(); classroomConfirmation = null } }
    fun submitClassroom() = run {
        check(!pendingWrite) { "请先核验上次结果。" }
        val confirmed = requireNotNull(classroomConfirmation)
        val current = read { api().user() }
        check(current.uid == confirmed.user.uid && activity == confirmed.activity && course == confirmed.course) { "账号或活动已变更，请重新确认。" }
        user = current
        val value = classroomFlow.begin(System.currentTimeMillis()); classroomConfirmation = null
        pendingWrite = true; save()
        val result = api().submitClassroom(value)
        classroomFlow.finish(result); classroomResult = result; pendingWrite = result == XxtClassResult.UNKNOWN; save()
        message = when (result) {
            XxtClassResult.SUCCESS -> "课堂活动提交成功。再次回复讨论请返回后重新打开。"
            XxtClassResult.REJECTED -> "提交未成功，请核对输入和活动要求；不会自动重试。"
            XxtClassResult.UNKNOWN -> "结果未知，请在官方学习通确认；不会自动重试。"
        }
    }
    fun dismissPickAlert() { pickAlert = false }
    fun monitorPick(enabled: Boolean) {
        if (!enabled) { pickGeneration++; pickWork?.cancel(); pickWork = null; pickMonitoring = false; return }
        if (pickWork?.isActive == true || busy) return
        val selected = activity?.takeIf { it.type == 11 && it.ongoing } ?: return
        val owner = user ?: return
        val token = pickGeneration
        pickMonitoring = true
        pickWork = viewModelScope.launch {
            try {
                xxtPollPicked(read = { read { api().picked(selected, owner.uid) } }, update = { status ->
                    if (activity != selected || user?.uid != owner.uid) throw CancellationException()
                    if (pickTracker.observe(status)) pickAlert = true
                    pickMessage = if (status.count > 0) "你已被选中！" else "暂未选中本人，正在监测…"
                    if (!status.ongoing) pickMessage += " 活动已结束。"
                })
            } catch (e: CancellationException) { throw e }
            catch (_: Exception) { pickMessage = "读取选人状态失败，已停止监测。请重新打开页面或手动刷新。" }
            finally { if (token == pickGeneration) pickMonitoring = false }
        }
    }
    fun submit() = run {
        check(!pendingWrite) { "请先核验上次结果。" }
        val confirmedUid = requireNotNull(user).uid
        val current = read { api().user() }
        check(current.uid == confirmedUid) { "账号已变更，请重新加载并确认。" }
        user = current
        val value = flow.begin(System.currentTimeMillis()); confirmation = null
        pendingWrite = true; save()
        val result = api().sign(requireNotNull(user), value, validateToken, flow.enc2)
        flow.finish(result)
        pendingWrite = result == XxtSignResult.Unknown
        if (result !is XxtSignResult.Captcha) discardPhoto()
        save()
        when (result) {
            XxtSignResult.Success -> message = "签到成功。"
            XxtSignResult.Rejected -> message = "签到未成功，请核对活动要求并在官方学习通查看详情。"
            XxtSignResult.Unknown -> message = "结果未知，请在官方学习通确认；不会自动重试。"
            is XxtSignResult.Captcha -> { validateToken = ""; captcha = api().captcha(value) }
        }
    }
    fun logout() {
        monitorPick(false)
        val old = work; generation++; work?.cancel(); draftWork?.cancel(); busy = true
        work = viewModelScope.launch {
            try {
                old?.join()
                draftWork?.join()
                if (!demo) { backend?.clear() ?: withContext(Dispatchers.IO) { storage.clear() } }
                else backend?.clear()
                withContext(Dispatchers.IO) { getApplication<Application>().filesDir.listFiles()?.filter { it.name.startsWith(if (demo) "xxt_demo_photo_" else "xxt_photo_") }?.forEach { it.delete() } }
                withContext(Dispatchers.IO) { File(getApplication<Application>().cacheDir, "xxt_camera").deleteRecursively() }
                backend = null; user = null; courses = emptyList(); activities = emptyList(); course = null; activity = null; detail = null; loaded = false; qrLogin = null; pendingWrite = false; resetSign(); error = ""
                savedState.remove<String>("draft")
            } catch (_: Exception) { error = "本地学习通数据未能完全清除，请重试或在系统设置清除应用数据。" }
            finally { busy = false }
        }
    }
}
