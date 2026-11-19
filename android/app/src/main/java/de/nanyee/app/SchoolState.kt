package de.nanyee.app

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.*
import java.time.Instant

class SchoolState(app: Application) : AndroidViewModel(app) {
    private val api = SchoolApi()
    private val prefs = app.getSharedPreferences("preferences", 0)
    private val secure by lazy {
        EncryptedSharedPreferences.create(app, "school_credentials", MasterKey.Builder(app).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(), EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    }
    var account by mutableStateOf("")
    var password by mutableStateOf("")
    var remember by mutableStateOf(false)
    var captchaText by mutableStateOf("")
    var captcha by mutableStateOf<JsonObject?>(null)
    private var session = ""
    var sessionGeneration by mutableIntStateOf(0)
        private set
    private val jobs = mutableMapOf<String, Job>()
    var expires by mutableStateOf("")
    var loggedIn by mutableStateOf(false)
    var demo by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var error by mutableStateOf("")
    var tab by mutableIntStateOf(0)
    var semesters by mutableStateOf(emptyList<JsonObject>())
    var semester by mutableStateOf("")
    var totalWeeks by mutableIntStateOf(prefs.getInt("weeks", 20).coerceIn(1, 30))
    var week by mutableIntStateOf(1)
    var courses by mutableStateOf(emptyList<JsonObject>())
    var grades by mutableStateOf<JsonObject?>(null)

    init {
        runCatching { account = secure.getString("account", "") ?: ""; password = secure.getString("password", "") ?: ""; remember = account.isNotEmpty() }
        refreshCaptcha()
        viewModelScope.launch { while (true) { delay(1000); if (loggedIn && !demo && runCatching { Instant.now().isAfter(Instant.parse(expires)) }.getOrDefault(true)) { logout(); error = "学校会话已过期，请重新登录。" } } }
    }
    private fun launch(key: String = "captcha", block: suspend () -> Unit) {
        jobs.remove(key)?.cancel()
        val generation = sessionGeneration
        val job = viewModelScope.launch(start = kotlinx.coroutines.CoroutineStart.LAZY) {
            error = ""
            try { block() } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (generation != sessionGeneration) return@launch
                if (e is SchoolError && loggedIn && (e.status == 401 || e.status == 410)) logout()
                error = if (e is SchoolError) e.message ?: "请求失败" else "操作失败，请稍后重试。"
            } finally {
                if (jobs[key] == coroutineContext[Job]) jobs.remove(key)
                busy = jobs.isNotEmpty()
            }
        }
        jobs[key] = job; busy = true; job.start()
    }
    private suspend fun fetchCaptcha() { captcha = null; captchaText = ""; captcha = api.request("captcha") }
    fun refreshCaptcha() = launch { fetchCaptcha() }
    fun updateRemember(value: Boolean) { remember = value; if (!value) runCatching { secure.edit().clear().apply() } }
    fun login() = launch("login") {
        val flow = captcha?.text("flow_id") ?: return@launch
        val submittedAccount = account.trim()
        val submittedPassword = password
        val submittedCaptcha = captchaText.trim()
        captcha = null
        try {
            val response = api.request("session", payload("flow_id" to flow, "account" to submittedAccount, "password" to submittedPassword, "captcha" to submittedCaptcha))
            session = response.text("academic_session_id"); expires = response.text("expires_at")
            if (session.isEmpty() || expires.isEmpty()) throw SchoolError(0, "INVALID_RESPONSE", "登录响应无效，请重试。")
            if (remember) secure.edit().putString("account", submittedAccount).putString("password", submittedPassword).apply()
            password = ""; captchaText = ""; loggedIn = true; demo = false; tab = 0
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            runCatching { fetchCaptcha() }
            throw e
        }
        launch("timetable") { loadTimetable() }
        launch("grades") { loadGrades() }
    }
    private fun sessionBody() = payload("academic_session_id" to session)
    private suspend fun loadTimetable() {
        val response = api.request("timetable.semesters", sessionBody())
        semesters = response.items("semesters")
        if (semesters.none { it.text("code") == semester }) semester = response.text("default_code")
        queryTimetable()
    }
    private suspend fun queryTimetable() {
        courses = api.request("timetable", buildJsonObject { put("academic_session_id", session); if (semester.isNotEmpty()) put("semester_code", semester); put("total_weeks", totalWeeks) }).items("courses")
    }
    private suspend fun loadGrades() { grades = api.request("grades", sessionBody()) }
    fun reload() { if (!demo && loggedIn) { if (tab == 0) launch("timetable") { if (semesters.isEmpty()) loadTimetable() else queryTimetable() } else launch("grades") { loadGrades() } } }
    fun selectSemester(code: String) { semester = code; if (demo) courses = demoCourses(code) else if (loggedIn) launch("timetable") { queryTimetable() } }
    fun setWeeks(value: Int) { totalWeeks = value.coerceIn(1, 30); week = week.coerceAtMost(totalWeeks); prefs.edit().putInt("weeks", totalWeeks).apply(); if (!demo && loggedIn) launch("timetable") { queryTimetable() } }
    private fun clearRequests() {
        sessionGeneration++
        jobs.values.toList().forEach { it.cancel() }; jobs.clear(); busy = false
    }
    fun logout() {
        clearRequests()
        session = ""; expires = ""; loggedIn = false; demo = false; courses = emptyList(); grades = null; semesters = emptyList(); semester = ""; password = ""; captcha = null; captchaText = ""; api.clear()
        if (!busy) refreshCaptcha()
    }
    fun startDemo() {
        clearRequests()
        session = ""; expires = ""; password = ""; captchaText = ""; captcha = null; demo = true; loggedIn = true; tab = 0; error = ""; week = 1
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
            put("start_time", if (i % 2 == 0) "08:00" else "10:10"); put("end_time", if (i % 2 == 0) "09:40" else "11:50")
            put("location", "教学楼 ${201 + i}"); put("teachers", "示例教师"); put("weeks", JsonArray((1..20).map { JsonPrimitive(it) }))
        } }
}

internal fun demoGrades() = buildJsonObject {
            put("summary", payload("weighted_gpa" to "3.82", "required_gpa" to "3.90", "average_score" to "88.6", "required_average_score" to "89.2", "total_credits" to "30", "total_courses" to "10", "failed_count" to "0"))
            put("grades", JsonArray(listOf("202501" to "2025-2026-1", "202402" to "2024-2025-2").flatMap { (code, label) -> demoCourses(code).mapIndexed { i, c -> buildJsonObject {
                put("name", c.text("name")); put("semester", label); put("credits", 3); put("raw_score", "${94 - i * 2}"); put("grade_point", "${4.4 - i * 0.2}")
                put("ranking", buildJsonObject { put("course_rank", 12); put("course_total", 240); put("class_rank", 3); put("class_total", 40); put("distribution", buildJsonObject { put("lt60", 2); put("s60to70", 15); put("s70to80", 48); put("s80to90", 105); put("gte90", 70) }) })
            } } }))
}
