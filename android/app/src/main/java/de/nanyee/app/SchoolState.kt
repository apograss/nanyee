package de.nanyee.app

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.*
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.UUID

class SchoolState(app: Application, private val saved: SavedStateHandle) : AndroidViewModel(app) {
    private val api = SchoolApi()
    private val prefs = app.getSharedPreferences("preferences", 0)
    private val timetableCache by lazy { TimetableCacheStore(EncryptedTimetableStorage(app)) }
    private var cachedTimetables by mutableStateOf<TimetableSnapshot?>(null)
    private var liveOwner = ""
    private var loginDestination by mutableStateOf<Int?>(null)
    private var cacheReturnView: CachedTimetableView? = saved.get<String>("cacheReturnSemester")?.let {
        CachedTimetableView(it, saved["cacheReturnWeek"] ?: 1, saved["cacheReturnPinned"] ?: false)
    }
    private val secure by lazy {
        EncryptedSharedPreferences.create(app, "school_credentials", MasterKey.Builder(app).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(), EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }
    var account by mutableStateOf(prefs.getString("account", "") ?: "")
    var password by mutableStateOf("")
    var remember by mutableStateOf(prefs.getBoolean("remember", false))
    var captchaText by mutableStateOf("")
    var captcha by mutableStateOf<JsonObject?>(null)
    private var session = ""
    var sessionGeneration by mutableIntStateOf(0)
        private set
    private val jobs = mutableMapOf<String, Job>()
    private var captchaAttemptAt = Instant.EPOCH
    var expires by mutableStateOf("")
    var loggedIn by mutableStateOf(false)
    var demo by mutableStateOf(false)
    var cachedMode by mutableStateOf(false)
        private set
    val homeVisible get() = loggedIn || cachedMode
    val canReturnToCache get() = !homeVisible && loginDestination != null
    val timetableUpdatedAt get() = cachedTimetables?.tables?.get(semester)?.updatedAt ?: ""
    var semesterStart by mutableStateOf("")
        private set
    val currentWeek get() = currentTeachingWeek(semesterStart, today, totalWeeks)
    val calendarHint get() = if (semesterStart.isBlank()) "暂未取得校历，可手动选周" else if (currentWeek == null) "当前日期不在本学期教学周内" else ""
    var busy by mutableStateOf(false)
    var loginInFlight by mutableStateOf(false)
        private set
    var error by mutableStateOf("")
    var hint by mutableStateOf("")
    var gradesLoading by mutableStateOf(false)
        private set
    private var selectedTab by mutableIntStateOf(saved["tab"] ?: 0)
    var tab: Int
        get() = selectedTab
        set(value) { selectedTab = value; saved["tab"] = value }
    var semesters by mutableStateOf(emptyList<JsonObject>())
    private var selectedSemester by mutableStateOf(saved["semester"] ?: "")
    var semester: String
        get() = selectedSemester
        set(value) { selectedSemester = value; saved["semester"] = value }
    var totalWeeks by mutableIntStateOf(prefs.getInt("weeks", 20).coerceIn(1, 30))
    private var selectedWeek by mutableIntStateOf(saved["week"] ?: 1)
    private var userPickedWeek = saved.get<Boolean>("userPickedWeek") ?: false
    var week: Int
        get() = selectedWeek
        set(value) { selectedWeek = value; saved["week"] = value }
    var courseDataIdentity by mutableStateOf(UUID.randomUUID().toString())
        private set
    var gradeDataIdentity by mutableStateOf(UUID.randomUUID().toString())
        private set
    private var loadedCourses by mutableStateOf(emptyList<JsonObject>())
    var courses: List<JsonObject>
        get() = loadedCourses
        set(value) { loadedCourses = value; courseDataIdentity = UUID.randomUUID().toString() }
    private var loadedGrades by mutableStateOf<JsonObject?>(null)
    var grades: JsonObject?
        get() = loadedGrades
        set(value) { loadedGrades = value; gradeDataIdentity = UUID.randomUUID().toString() }
    var today by mutableStateOf(runCatching { LocalDate.parse(saved.get<String>("date")) }.getOrDefault(LocalDate.now(ZoneId.of("Asia/Shanghai"))))
        private set

    init {
        if (remember) runCatching { if (secure.getString("account", "") == account.trim()) password = secure.getString("password", "") ?: "" }
        if (saved.get<Boolean>("demo") == true) {
            val restoreTab = tab
            val restoreSemester = semester
            val restoreWeek = week
            val restoreUserPickedWeek = userPickedWeek
            startDemo()
            if (semesters.any { it.text("code") == restoreSemester }) selectSemester(restoreSemester)
            tab = restoreTab.coerceIn(0, 2); week = restoreWeek.coerceIn(1, totalWeeks)
            userPickedWeek = restoreUserPickedWeek; saved["userPickedWeek"] = userPickedWeek
        } else {
            if (saved.get<Boolean>("hadSession") == true) hint = "会话已过期，请重新登录"
            if (!restoreCachedTimetable()) launch(silent = true) { fetchCaptcha() }
        }
        updateDate()
        viewModelScope.launch { while (true) { delay(1000); updateDate(); checkCaptcha(); if (loggedIn && !demo && runCatching { Instant.now().isAfter(Instant.parse(expires)) }.getOrDefault(true)) { expireSession(); error = "学校会话已过期，请重新登录。" } } }
    }
    private fun updateDate() {
        val now = LocalDate.now(ZoneId.of("Asia/Shanghai"))
        if (now != today) {
            today = now
            if (homeVisible) followCurrentWeek()
        }
        saved["date"] = now.toString()
    }
    fun onResume() { updateDate(); checkCaptcha() }
    fun selectWeek(value: Int) {
        week = value.coerceIn(1, totalWeeks); userPickedWeek = true; saved["userPickedWeek"] = true
    }
    fun returnToCurrentWeek() { userPickedWeek = false; saved["userPickedWeek"] = false; followCurrentWeek() }
    private fun followCurrentWeek() { if (!userPickedWeek) currentWeek?.let { week = it } }
    private fun launch(key: String = "captcha", silent: Boolean = false, block: suspend () -> Unit) {
        jobs.remove(key)?.cancel()
        val generation = sessionGeneration
        val job = viewModelScope.launch(start = kotlinx.coroutines.CoroutineStart.LAZY) {
            error = ""
            try { block() } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (generation != sessionGeneration) return@launch
                if (e is SchoolError && loggedIn && (e.status == 401 || e.status == 410)) expireSession()
                if (!silent) error = if (e is SchoolError) e.message ?: "请求失败" else "操作失败，请稍后重试。"
            } finally {
                if (jobs[key] == coroutineContext[Job]) { jobs.remove(key); if (key == "login") loginInFlight = false }
                busy = jobs.isNotEmpty()
            }
        }
        jobs[key] = job; busy = true; if (key == "login") loginInFlight = true; job.start()
    }
    private suspend fun fetchCaptcha() { captchaAttemptAt = Instant.now(); captchaText = ""; captcha = api.request("captcha") }
    fun checkCaptcha() {
        if (homeVisible || busy || captcha == null || Instant.now().isBefore(captchaAttemptAt.plusSeconds(60))) return
        if (captchaNeedsRefresh(captcha?.text("expires_at") ?: "", Instant.now())) {
            hint = "验证码已更新，请重新输入"
            launch(silent = true) { fetchCaptcha() }
        }
    }
    fun refreshCaptcha() = launch { fetchCaptcha() }
    fun updateAccount(value: String) { account = value; prefs.edit().putString("account", value).apply() }
    fun updateRemember(value: Boolean) { remember = value; prefs.edit().putBoolean("remember", value).apply(); if (!value) runCatching { secure.edit().clear().apply() } }
    fun login() = launch("login") {
        val flow = captcha?.text("flow_id") ?: return@launch
        val submittedAccount = account.trim()
        val submittedPassword = password
        val submittedCaptcha = captchaText.trim()
        val submittedRemember = remember
        val destination = loginDestination ?: 0
        val requestedSemester = if (loginDestination != null) semester else ""
        if (captchaNeedsRefresh(captcha?.text("expires_at") ?: "", Instant.now())) {
            fetchCaptcha(); hint = "验证码已更新，请重新输入"; return@launch
        }
        try {
            val response = api.request("session", payload("flow_id" to flow, "account" to submittedAccount, "password" to submittedPassword, "captcha" to submittedCaptcha))
            session = response.text("academic_session_id"); expires = response.text("expires_at")
            if (session.isEmpty() || expires.isEmpty()) throw SchoolError(0, "INVALID_RESPONSE", "登录响应无效，请重试。")
            if (cachedTimetables != null && cachedTimetables?.owner != submittedAccount) { timetableCache.clear(); cachedTimetables = null }
            liveOwner = submittedAccount
            if (submittedRemember && remember) secure.edit().putString("account", submittedAccount).putString("password", submittedPassword).apply()
            password = ""; captchaText = ""; loggedIn = true; demo = false; cachedMode = false; tab = destination
            saved["hadSession"] = true; saved["demo"] = false
            resetTimetableSelection()
            semester = requestedSemester; loginDestination = null; clearCacheReturnView()
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            runCatching { fetchCaptcha() }
            if (e is SchoolError && e.status == 410) { hint = "验证码已过期，已更新，请重新输入"; return@launch }
            throw e
        }
        launch("timetable") { loadTimetable() }
        launch("grades") { loadGrades() }
    }
    private fun sessionBody() = payload("academic_session_id" to session)
    private suspend fun loadTimetable() {
        courses = emptyList(); semesterStart = ""
        val response = api.request("timetable.semesters", sessionBody())
        semesters = response.items("semesters")
        if (semesters.none { it.text("code") == semester }) semester = response.text("default_code")
        queryTimetable()
    }
    private suspend fun queryTimetable() {
        val response = api.request("timetable", buildJsonObject { put("academic_session_id", session); if (semester.isNotEmpty()) put("semester_code", semester); put("total_weeks", totalWeeks) })
        if (response["courses"] !is JsonArray) throw SchoolError(0, "INVALID_RESPONSE", "课表响应无效，请重试。")
        semester = response.text("semester_code").ifEmpty { semester }
        courses = response.items("courses")
        val previous = cachedTimetables?.takeIf { it.owner == liveOwner }?.tables?.get(semester)
        semesterStart = semesterStartFromMetadata(response, today)
            ?: semesters.firstOrNull { it.text("code") == semester }?.let { semesterStartFromMetadata(it, today) }
            ?: previous?.semesterStart.orEmpty()
        followCurrentWeek()
        val table = CachedTimetable(courses, Instant.now().toString(), totalWeeks, semesterStart)
        saveTimetable(table)
        if (semesterStart.isEmpty()) {
            try {
                semesterStart = api.timetableSemesterStart(buildJsonObject { put("academic_session_id", session); put("semester_code", semester); put("total_weeks", totalWeeks); put("campus", "main") })
                followCurrentWeek()
                saveTimetable(table.copy(semesterStart = semesterStart))
            } catch (e: Exception) {
                if (e is CancellationException || e is SchoolError && e.status in listOf(401, 410)) throw e
            }
        }
    }
    private suspend fun loadGrades() {
        gradesLoading = true
        try { grades = api.request("grades", sessionBody()) } finally { gradesLoading = false }
    }
    fun reload() {
        if (cachedMode) requireSchoolLogin(0)
        else if (!demo && loggedIn) {
            if (tab == 0) launch("timetable") { if (semesters.isEmpty()) loadTimetable() else queryTimetable() }
            else launch("grades") { loadGrades() }
        }
    }
    fun selectTab(value: Int) { if (cachedMode && value == 1) requireSchoolLogin(1) else tab = value }
    fun selectSemester(code: String) {
        if (cachedMode && cachedTimetables?.tables?.containsKey(code) != true) rememberCacheView()
        semester = code
        if (demo) courses = demoCourses(code)
        else if (cachedMode) {
            val table = cachedTimetables?.tables?.get(code)
            if (table == null) { courses = emptyList(); semesterStart = ""; requireSchoolLogin(0) } else { courses = table.courses; totalWeeks = table.totalWeeks; semesterStart = table.semesterStart; week = week.coerceAtMost(totalWeeks); followCurrentWeek() }
        } else if (loggedIn) { semesterStart = ""; courses = emptyList(); launch("timetable") { queryTimetable() } }
    }
    fun setWeeks(value: Int) {
        if (cachedMode) { error = "离线课表的周数以已下载数据为准，请登录后修改。"; return }
        totalWeeks = value.coerceIn(1, 30); week = week.coerceAtMost(totalWeeks); followCurrentWeek()
        prefs.edit().putInt("weeks", totalWeeks).apply()
        if (!demo && loggedIn) launch("timetable") { queryTimetable() }
    }
    private fun clearRequests() {
        sessionGeneration++
        jobs.values.toList().forEach { it.cancel() }; jobs.clear(); busy = false; loginInFlight = false
    }
    fun cancelLogin() {
        jobs.remove("login")?.cancel(); loginInFlight = false; busy = jobs.isNotEmpty()
        captcha = null; captchaText = ""
        hint = "已取消登录，请输入新验证码"
        launch(silent = true) { fetchCaptcha() }
    }
    private fun resetTimetableSelection() {
        userPickedWeek = false; saved["userPickedWeek"] = false; week = 1; semester = ""; semesterStart = ""
    }
    private fun saveTimetable(table: CachedTimetable) {
        if (!loggedIn || demo || !semester.matches(Regex("\\d{6}"))) return
        val previous = cachedTimetables?.takeIf { it.owner == liveOwner }?.tables ?: emptyMap()
        val snapshot = TimetableSnapshot(liveOwner, semesters, semester, previous + (semester to table))
        runCatching { timetableCache.save(snapshot) }.onSuccess { cachedTimetables = snapshot }.onFailure { error = "课表已加载，但无法加密保存到本机。" }
    }
    private fun restoreCachedTimetable(view: CachedTimetableView? = null): Boolean {
        val snapshot = runCatching { timetableCache.load() }.getOrElse { hint = "本机课表无法读取，请重新登录"; null } ?: return false
        cachedTimetables = snapshot
        val restored = snapshot.restoreView(view)
        semesters = snapshot.semesters; semester = restored.semester
        val table = snapshot.tables.getValue(semester)
        courses = table.courses; totalWeeks = table.totalWeeks; semesterStart = table.semesterStart
        week = restored.week; userPickedWeek = restored.userPickedWeek; saved["userPickedWeek"] = userPickedWeek
        if (view == null) followCurrentWeek()
        cachedMode = true; tab = 0
        return true
    }
    private fun rememberCacheView() {
        if (cacheReturnView != null || cachedTimetables?.tables?.containsKey(semester) != true) return
        cacheReturnView = CachedTimetableView(semester, week, userPickedWeek)
        saved["cacheReturnSemester"] = semester; saved["cacheReturnWeek"] = week; saved["cacheReturnPinned"] = userPickedWeek
    }
    private fun clearCacheReturnView() {
        cacheReturnView = null
        saved.remove<String>("cacheReturnSemester"); saved.remove<Int>("cacheReturnWeek"); saved.remove<Boolean>("cacheReturnPinned")
    }
    private fun requireSchoolLogin(destination: Int) {
        rememberCacheView()
        clearRequests(); loginDestination = destination; cachedMode = false
        hint = if (destination == 1) "请登录学校系统查看成绩" else "请登录学校系统更新课表"
        launch(silent = true) { fetchCaptcha() }
    }
    fun returnToCache() {
        clearRequests(); loginDestination = null
        restoreCachedTimetable(cacheReturnView)
        clearCacheReturnView()
    }
    private fun expireSession() {
        clearRequests(); session = ""; expires = ""; liveOwner = ""; loggedIn = false; grades = null; api.clear()
        if (!restoreCachedTimetable()) launch(silent = true) { fetchCaptcha() }
    }
    fun logout() {
        val wasDemo = demo
        val returnView = cacheReturnView.takeIf { wasDemo }
        if (!wasDemo) cachedTimetables = null
        clearRequests()
        resetTimetableSelection()
        clearCacheReturnView()
        saved["demo"] = false; saved["hadSession"] = false
        session = ""; expires = ""; liveOwner = ""; loginDestination = null; loggedIn = false; demo = false; cachedMode = false; courses = emptyList(); grades = null; semesters = emptyList(); semester = ""; gradesLoading = false; error = ""
        if (returnView != null && restoreCachedTimetable(returnView)) return
        if (!wasDemo) {
            password = ""; captcha = null; captchaText = ""; api.clear()
            val cacheCleared = runCatching { timetableCache.clear() }.isSuccess
            launch(silent = true) { fetchCaptcha() }
            if (!cacheCleared) error = "学校会话已退出，但本机课表未能清除，重启后仍可能显示。请在系统设置中清除应用数据。"
        } else if (captcha == null) launch(silent = true) { fetchCaptcha() } else checkCaptcha()
    }
    fun startDemo() {
        if (cachedMode) rememberCacheView()
        if (loginInFlight) { captcha = null; captchaText = "" }
        clearRequests()
        saved["demo"] = true; saved["hadSession"] = false
        resetTimetableSelection()
        session = ""; expires = ""; loginDestination = null; cachedMode = false; demo = true; loggedIn = true; tab = 0; error = ""; week = 1
        semesterStart = today.with(java.time.temporal.TemporalAdjusters.previousOrSame(java.time.DayOfWeek.MONDAY)).toString()
        semesters = listOf(payload("code" to "202501", "label" to "2025-2026-1"), payload("code" to "202402", "label" to "2024-2025-2")); semester = "202501"
        courses = demoCourses(semester)
        grades = demoGrades()
    }
}

internal fun demoCourses(semester: String): List<JsonObject> {
    val previous = semester == "202402"
    val names = if (previous) listOf("医学生物学", "有机化学", "医学伦理学", "大学物理") else listOf("人体解剖学", "大学英语", "医用高等数学", "基础化学", "医学导论", "体育")
    return names.mapIndexed { i, name -> buildJsonObject {
            put("name", name); put("weekday", (i + if (previous) 1 else 0) % 5 + 1); put("start_node", if (i % 2 == 0) 1 else 3); put("end_node", if (i % 2 == 0) 2 else 4)
            put("start_time", if (i % 2 == 0) "08:00" else "09:50"); put("end_time", if (i % 2 == 0) "09:25" else "11:15")
            put("location", "教学楼 ${201 + i}"); put("teachers", "示例教师"); put("weeks", JsonArray((1..20).map { JsonPrimitive(it) }))
        } }
}

internal fun demoGrades(): JsonObject {
    val grades = listOf("202501" to "2025-2026-1", "202402" to "2024-2025-2").flatMap { (code, label) -> demoCourses(code).mapIndexed { i, c -> buildJsonObject {
        put("name", c.text("name")); put("semester", label); put("credits", 3); put("study_type", if (i % 3 == 2) "选修" else "必修")
        put("raw_score", "${94 - i * 2}"); put("numeric_score", 94 - i * 2); put("grade_point", (44 - i * 2).toBigDecimal().movePointLeft(1).toPlainString())
        put("ranking", buildJsonObject { put("course_rank", 12 + i * 25); put("course_total", 240); put("class_rank", 2 + i * 3); put("class_total", 40); put("distribution", buildJsonObject { put("lt60", 2); put("s60to70", 15); put("s70to80", 48); put("s80to90", 105); put("gte90", 70) }) })
    } } }
    return buildJsonObject { put("summary", gradeSummary(grades)); put("grades", JsonArray(grades)) }
}
