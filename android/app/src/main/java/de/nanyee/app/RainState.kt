package de.nanyee.app

import android.app.Application
import android.graphics.Bitmap
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

internal class RainState(application: Application) : AndroidViewModel(application) {
    var demo by mutableStateOf(false); private set
    var ready by mutableStateOf(false); private set
    var host by mutableStateOf(RainHost.WWW); private set
    var user by mutableStateOf<RainUser?>(null); private set
    var qr by mutableStateOf<RainQr?>(null); private set
    var courses by mutableStateOf<List<RainCourse>>(emptyList()); private set
    var onLesson by mutableStateOf<List<RainOnLesson>>(emptyList()); private set
    var lesson by mutableStateOf<RainLesson?>(null); private set
    var lessonFinished by mutableStateOf(false); private set
    var resolvedLesson by mutableStateOf(""); private set
    var eligibility by mutableStateOf<RainEligibility?>(null); private set
    var position by mutableStateOf<XxtPosition?>(null); private set
    var presentation by mutableStateOf<RainPresentation?>(null); private set
    var slide by mutableIntStateOf(0); private set
    var image by mutableStateOf<Bitmap?>(null); private set
    var follow by mutableStateOf(true); private set
    var liveStatus by mutableStateOf("未连接"); private set
    var loaded by mutableStateOf(false); private set
    var busy by mutableStateOf(false); private set
    var exporting by mutableStateOf(false); private set
    var saved by mutableIntStateOf(0); private set
    var error by mutableStateOf(""); private set
    var message by mutableStateOf(""); private set
    var unknownKey by mutableStateOf(""); private set
    var confirmation by mutableStateOf<RainAction?>(null); private set
    var scenario by mutableStateOf(RainDemoFailure.NONE); private set
    val events = mutableStateListOf<RainEvent>()
    private var drafts by mutableStateOf<Map<String, RainDraft>>(emptyMap())
    private val unlocks = mutableStateMapOf<String, RainUnlock>()
    private val gate = RainGate()
    private lateinit var store: RainStore
    private lateinit var backend: RainBackend
    private val live = RainLiveOwner()
    private var foreground = false
    private var generation = 0
    private var initialized = false
    private var work: Job? = null
    private var visibleWork: Job? = null
    private var deckWork: Job? = null
    private var imageWork: Job? = null
    private var eligibilityWork: Job? = null
    private var draftWork: Job? = null
    val currentSlide get() = presentation?.slides?.getOrNull(slide)
    val problem get() = currentSlide?.problem
    val unlocked get() = problem?.id?.let { unlocks[it] }
    val draft get() = problem?.id?.let { drafts[it] } ?: RainDraft()
    private fun pendingJournal() = RainPendingWrites(store, host, requireNotNull(user).id)
    private fun draftKey(value: RainLesson) = "drafts.${host.name}.${value.uid}.${value.id}"
    fun initialize(demo: Boolean) {
        if (initialized) return
        initialized = true; this.demo = demo; busy = true
        work = viewModelScope.launch {
            try {
                store = withContext(Dispatchers.IO) { if (demo) MemoryRainStore() else EncryptedRainStore(getApplication()) }
                host = runCatching { RainHost.valueOf(store.read("host")) }.getOrDefault(RainHost.WWW)
                backend = if (demo) DemoRainBackend(host) else RainApi(store, host)
                ready = true
                if (demo || store.read("owner.${host.name}").isNotBlank()) loadAccount()
            } catch (e: CancellationException) { throw e } catch (e: Exception) { fail(e); if (!ready) initialized = false }
            finally { busy = false; restartVisibility() }
        }
    }
    private fun fail(e: Exception) {
        error = when (e) { is XxtLocationFailure, is RainFailure -> e.message.orEmpty(); else -> "操作未完成；输入不完整、本地存储不可用或响应格式有变，请刷新后重试。" }
        if (e is RainFailure && e.kind == "SESSION") { leaveLesson(); qr = null; user = null; courses = emptyList(); onLesson = emptyList(); unknownKey = "" }
    }
    private fun read(block: suspend () -> Unit) {
        if (!ready || busy) return
        busy = true; error = ""; message = ""
        work = viewModelScope.launch {
            try { block() } catch (e: CancellationException) { throw e } catch (e: Exception) { fail(e) }
            finally { busy = false; restartVisibility() }
        }
    }
    private suspend fun loadAccount() {
        val current = backend.user()
        if (user?.id != current.id) { leaveLesson(); user = current; loaded = false; courses = emptyList(); onLesson = emptyList() }
        unknownKey = pendingJournal().pending
        courses = backend.courses(); loaded = true
    }
    fun refresh() = read { loadAccount() }
    fun beginQr() = read { require(lesson == null); qr = backend.qr(); message = "请扫码授权；仅在当前页面前台等待授权。" }
    fun cancelQr() { qr = null; restartVisibility() }
    fun setForeground(value: Boolean) { if (foreground != value) { foreground = value; restartVisibility() } }
    private fun stopVisibility() { generation++; visibleWork?.cancel(); visibleWork = null; live.stop(); liveStatus = "已停止（离开页面 / 后台）" }
    private fun restartVisibility() {
        stopVisibility()
        if (!foreground || !ready || busy) return
        val version = generation
        val joined = lesson
        if (joined != null) {
            if (lessonFinished) return
            liveStatus = "前台连接中"
            live.update(true, true, joined) { value -> backend.connect(value, { frame -> viewModelScope.launch { if (foreground && version == generation && lesson == value) accept(frame) } }, { viewModelScope.launch { if (version == generation) { live.stop(); liveStatus = "连接已断开，点击重新连接；不会自动签到" } } }) }
            return
        }
        visibleWork = viewModelScope.launch {
            try {
                val login = qr
                if (login != null) {
                    val success = backend.poll(login)
                    ensureActive()
                    if (qr != login) return@launch
                    qr = null
                    if (success) { loadAccount(); message = "已授权当前本人账号。"; restartVisibility() }
                    else error = "二维码已超时，请重新获取。"
                } else if (user != null) {
                    while (isActive) { onLesson = backend.onLesson(); delay(3000) }
                }
            } catch (e: CancellationException) { throw e } catch (e: Exception) { if (version == generation) { qr = null; fail(e); message = "前台自动检查已暂停，请手动刷新。" } }
        }
    }
    fun reconnect() { if (!busy) { error = ""; restartVisibility() } }
    private fun accept(frame: RainFrame) {
        if (frame.finished) { events.addAll(frame.events); stopVisibility(); lessonFinished = true; unlocks.clear(); message = "课堂已结束，仅保留只读课件；重新加入仍需确认。"; liveStatus = "课堂已结束"; return }
        frame.events.forEach { event ->
            if (event !in events) events.add(event)
            if (event.type == "problem" && event.problem.isNotBlank() && event.dt > 0) unlocks[event.problem] = RainUnlock(event.problem, event.dt, event.seconds)
        }
        while (events.size > 500) events.removeAt(0)
        frame.unlock?.takeIf { it.problem.isNotBlank() && it.dt > 0 }?.let { unlocks[it.problem] = it; events.add(RainEvent("problem", "题目已开放，请手动作答", it.dt, presentation?.id.orEmpty(), currentSlide?.index ?: 0, it.problem, it.seconds)) }
        if (frame.op in setOf("hello", "showpresentation") && frame.presentation.isNotBlank() && (follow || presentation == null)) loadPresentation(frame.presentation, frame.slide)
        else if (follow && frame.op in setOf("slide", "slidenav")) selectSlideNumber(frame.slide)
        if (frame.refreshLocation) refreshEligibility()
        liveStatus = "前台已连接 · ${frame.op}"
    }
    fun updateFollow(value: Boolean) { follow = value }
    fun loadPresentation(id: String = presentation?.id.orEmpty(), number: Int = slide + 1) {
        val joined = lesson ?: return
        if (id.isBlank()) return
        deckWork?.cancel()
        deckWork = viewModelScope.launch {
            try {
                val value = backend.presentation(joined, id)
                ensureActive(); if (lesson != joined) return@launch
                presentation = value; slide = (number - 1).coerceIn(0, maxOf(0, value.slides.lastIndex)); loadImage()
            } catch (e: CancellationException) { throw e } catch (e: Exception) { fail(e) }
        }
    }
    private fun selectSlideNumber(number: Int) { selectSlide(number - 1) }
    fun selectSlide(index: Int) { if (index in presentation?.slides.orEmpty().indices) { slide = index; loadImage() } }
    fun selectEvent(event: RainEvent) { follow = false; if (event.presentation.isNotBlank()) loadPresentation(event.presentation, event.slide) }
    fun loadImage() {
        imageWork?.cancel(); image = null
        val selected = currentSlide ?: return
        if (selected.image.isBlank()) { error = "本页没有可用图片，仅供查看题目文字。"; return }
        imageWork = viewModelScope.launch {
            try {
                val bitmap = withContext(Dispatchers.IO) { val bytes = backend.image(selected.image); if (demo) rainDemoBitmap(selected) else rainBitmap(bytes) }
                ensureActive(); if (currentSlide == selected) image = bitmap
            } catch (e: CancellationException) { throw e } catch (e: Exception) { fail(e) }
        }
    }
    fun refreshEligibility() {
        val joined = lesson ?: return
        eligibilityWork?.cancel()
        eligibilityWork = viewModelScope.launch { try { val result = backend.eligibility(joined); if (lesson == joined) eligibility = result } catch (e: CancellationException) { throw e } catch (e: Exception) { if (lesson == joined) fail(e) } }
    }
    fun locate() = read {
        val joined = requireNotNull(lesson)
        eligibility = backend.eligibility(joined)
        position = null
        position = xxtCurrentPosition(getApplication(), bd09 = false)
        message = "已获取真实手机位置；尚未提交。坐标为原始 WGS84，不采用活动中心坐标。"
    }
    fun updateDraft(value: RainDraft) {
        if (busy) return
        val id = problem?.id ?: return
        drafts = drafts + (id to value)
        val joined = lesson ?: return
        val valueToSave = drafts
        val key = draftKey(joined)
        draftWork?.cancel()
        draftWork = viewModelScope.launch { delay(200); try { withContext(Dispatchers.IO) { store.write(key, Json.encodeToString(valueToSave)) } } catch (e: CancellationException) { throw e } catch (e: Exception) { fail(e) } }
    }
    fun preview(action: RainAction) {
        if (busy || !ready) return
        error = ""; message = ""
        try {
            require(action is RainAction.Export || unknownKey.isBlank())
            if (action is RainAction.Scan) rainScanUrl(host, action.url)
            gate.preview(action, System.currentTimeMillis()); confirmation = gate.confirmation
        } catch (e: Exception) { fail(e) }
    }
    fun previewJoin(id: String, title: String) { user?.let { preview(RainAction.Join(it, id, title)) } }
    fun previewScan(url: String) { user?.let { preview(RainAction.Scan(it, url)) } }
    fun previewLocation() { val joined = lesson; val p = position; val eligible = eligibility; if (joined != null && p != null && eligible != null) preview(RainAction.Location(joined, p, eligible)) }
    fun previewAnswer(retry: Boolean) { val joined = lesson; val p = problem; val unlock = unlocked; if (joined != null && p != null && unlock != null) preview(RainAction.Answer(joined, p, unlock, draft, retry)) }
    fun previewExport(all: Boolean) { val joined = lesson; val deck = presentation; val selected = currentSlide; if (joined != null && deck != null && selected != null) preview(RainAction.Export(joined, deck, if (all) deck.slides else listOf(selected))) }
    fun dismiss() { if (!busy) { gate.dismiss(); confirmation = null } }
    private fun validateCurrent(action: RainAction) {
        when (action) {
            is RainAction.Join -> require(action.user == user && lesson == null)
            is RainAction.Scan -> require(action.user == user && lesson == null)
            is RainAction.Location -> require(!lessonFinished && action.lesson == lesson && action.position == position && action.eligibility == eligibility)
            is RainAction.Answer -> require(!lessonFinished && action.lesson == lesson && action.problem == problem && action.unlock == unlocked && action.draft == draft)
            is RainAction.Export -> require(action.lesson == lesson && action.presentation == presentation)
        }
    }
    fun confirm() {
        if (busy || confirmation == null) return
        val action = try { validateCurrent(requireNotNull(confirmation)); gate.begin(System.currentTimeMillis()) } catch (e: Exception) { dismiss(); fail(e); return }
        confirmation = null; busy = true; error = ""; message = ""; saved = 0
        val journal = if (action is RainAction.Export) null else pendingJournal()
        work = viewModelScope.launch {
            var marked = false
            try {
                journal?.let { withContext(Dispatchers.IO) { it.begin(action.key) }; marked = true }
                when (action) {
                    is RainAction.Join -> {
                        val joined = backend.join(action.user, action.lessonId)
                        lesson = joined; lessonFinished = false; resolvedLesson = ""; presentation = null; slide = 0; image = null; follow = true; events.clear(); unlocks.clear(); eligibility = null; position = null
                        drafts = runCatching { Json.decodeFromString<Map<String, RainDraft>>(store.read(draftKey(joined))) }.getOrDefault(emptyMap())
                        message = "课堂签到成功；直播只在前台页面运行。"; refreshEligibility()
                    }
                    is RainAction.Scan -> { resolvedLesson = backend.scan(action.user, action.url); message = "课堂码已解析；尚未调用课堂签到，请另行确认加入。" }
                    is RainAction.Location -> { handleResult(backend.locate(action)); eligibility = eligibility?.copy(signed = true); position = null }
                    is RainAction.Answer -> handleResult(backend.answer(action))
                    is RainAction.Export -> {
                        exporting = true
                        rainExportSlides(action.slides, { item ->
                            if (demo && scenario == RainDemoFailure.GALLERY) throw RainFailure("GALLERY", "演示：相册保存失败，未写入图片。")
                            val bitmap = withContext(Dispatchers.IO) { val bytes = backend.image(item.image); if (demo) rainDemoBitmap(item) else rainBitmap(bytes) }
                            try { rainSaveGallery(getApplication(), bitmap, "nanyee_ykt_${System.currentTimeMillis()}_${item.index}.png") } finally { bitmap.recycle() }
                        }, { count -> saved = count; message = "已保存 $saved / ${action.slides.size} 张到本机相册。" })
                    }
                }
                journal?.let { withContext(Dispatchers.IO) { it.completed() }; unknownKey = "" }
            } catch (e: CancellationException) { if (exporting) message = "保存已取消；已保存 $saved 张。"; throw e }
            catch (e: Exception) {
                if (journal != null) {
                    if (marked && !(e is RainFailure && e.kind == "UNKNOWN")) runCatching { withContext(Dispatchers.IO) { journal.completed() } }
                    unknownKey = runCatching { journal.pending }.getOrDefault(action.key)
                }
                fail(e)
                if (action is RainAction.Export) message = "保存已停止；已保存 $saved 张，未自动重试。"
            } finally { exporting = false; busy = false; gate.finish(); restartVisibility() }
        }
    }
    private fun handleResult(result: RainResult) {
        when (result) { RainResult.SUCCESS -> message = "雨课堂已确认提交成功。"; RainResult.REJECTED -> throw RainFailure("REJECTED", "雨课堂未接受本次提交，请核对要求；未自动重试。"); RainResult.UNKNOWN -> throw RainFailure("UNKNOWN", "提交结果未知，请先在官方雨课堂核验；不会自动重试。") }
    }
    fun cancelExport() { if (exporting) work?.cancel() }
    fun acknowledgeUnknown() = read { val journal = pendingJournal(); withContext(Dispatchers.IO) { journal.completed() }; unknownKey = ""; message = "已清除本地未知结果标记；下一次写入仍需重新预览确认。" }
    fun leaveLesson() {
        stopVisibility(); deckWork?.cancel(); imageWork?.cancel(); eligibilityWork?.cancel(); lesson = null; position = null; eligibility = null; unlocks.clear()
    }
    fun backToCourses() { if (!busy) { leaveLesson(); presentation = null; image = null; events.clear(); drafts = emptyMap(); restartVisibility() } }
    fun selectScenario(value: RainDemoFailure) { if (demo && !busy) { scenario = value; (backend as? DemoRainBackend)?.failure = value; dismiss(); restartVisibility() } }
    fun switchHost(value: RainHost) {
        if (!ready || busy || value == host) return
        read {
            cancelQr(); leaveLesson(); (backend as? RainApi)?.disable(); draftWork?.cancelAndJoin(); draftWork = null
            host = value; withContext(Dispatchers.IO) { store.write("host", host.name) }
            backend = if (demo) DemoRainBackend(host).also { it.failure = scenario } else RainApi(store, host)
            user = null; courses = emptyList(); onLesson = emptyList(); loaded = false; presentation = null; image = null; events.clear(); drafts = emptyMap(); resolvedLesson = ""; unknownKey = ""
            if (demo || store.read("owner.${host.name}").isNotBlank()) loadAccount()
        }
    }
    fun logout() = read {
        stopVisibility(); leaveLesson(); draftWork?.cancelAndJoin(); draftWork = null; qr = null
        backend.clear(); withContext(Dispatchers.IO) { store.clear() }
        backend = if (demo) DemoRainBackend(host).also { it.failure = scenario } else RainApi(store, host)
        user = null; courses = emptyList(); onLesson = emptyList(); presentation = null; image = null; events.clear(); drafts = emptyMap(); resolvedLesson = ""; unknownKey = ""; loaded = false
        message = "已清除本机所有雨课堂服务器的登录凭据、Cookie 与草稿；不影响教务或学习通。"
    }
    override fun onCleared() { stopVisibility(); if (::backend.isInitialized) (backend as? RainApi)?.disable(); super.onCleared() }
}
