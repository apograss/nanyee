package de.nanyee.app

import android.app.Application
import androidx.compose.runtime.*
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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
    private fun launch(block: suspend () -> Unit) {
        if (busy) return
        viewModelScope.launch {
            busy = true; error = ""
            try { block() } catch (e: Exception) {
                if (e is SchoolError && loggedIn && (e.status == 401 || e.status == 410)) logout()
                error = if (e is SchoolError) e.message ?: "请求失败" else "操作失败，请稍后重试。"
            } finally { busy = false }
        }
    }
    private suspend fun fetchCaptcha() { captcha = null; captchaText = ""; captcha = api.request("captcha") }
    fun refreshCaptcha() = launch { fetchCaptcha() }
    fun updateRemember(value: Boolean) { remember = value; if (!value) runCatching { secure.edit().clear().apply() } }
    fun login() = launch {
        val flow = captcha?.text("flow_id") ?: return@launch
        captcha = null
        try {
            val response = api.request("session", payload("flow_id" to flow, "account" to account.trim(), "password" to password, "captcha" to captchaText.trim()))
            session = response.text("academic_session_id"); expires = response.text("expires_at")
            if (session.isEmpty() || expires.isEmpty()) throw SchoolError(0, "INVALID_RESPONSE", "登录响应无效，请重试。")
            if (remember) secure.edit().putString("account", account).putString("password", password).apply()
            password = ""; captchaText = ""; loggedIn = true; demo = false; tab = 0
        } catch (e: Exception) {
            runCatching { fetchCaptcha() }
            throw e
        }
        loadTimetable(); loadGrades()
    }
    private fun sessionBody() = payload("academic_session_id" to session)
    private suspend fun loadTimetable() {
        val response = api.request("timetable.semesters", sessionBody())
        semesters = response.items("semesters"); semester = response.text("default_code")
        queryTimetable()
    }
    private suspend fun queryTimetable() {
        courses = api.request("timetable", buildJsonObject { put("academic_session_id", session); if (semester.isNotEmpty()) put("semester_code", semester); put("total_weeks", totalWeeks) }).items("courses")
    }
    private suspend fun loadGrades() { grades = api.request("grades", sessionBody()) }
    fun reload() = launch { if (!demo) { if (tab == 0) queryTimetable() else loadGrades() } }
    fun selectSemester(code: String) { semester = code; if (!demo) launch { queryTimetable() } }
    fun setWeeks(value: Int) { totalWeeks = value.coerceIn(1, 30); week = week.coerceAtMost(totalWeeks); prefs.edit().putInt("weeks", totalWeeks).apply(); if (!demo) launch { queryTimetable() } }
    fun logout() {
        session = ""; expires = ""; loggedIn = false; demo = false; courses = emptyList(); grades = null; semesters = emptyList(); semester = ""; password = ""; captcha = null; captchaText = ""; api.clear()
        if (!busy) refreshCaptcha()
    }
    fun startDemo() {
        session = ""; expires = ""; password = ""; captchaText = ""; captcha = null; demo = true; loggedIn = true; tab = 0; error = ""; week = 1
        semesters = listOf(payload("code" to "202501", "label" to "2025-2026-1")); semester = "202501"
        courses = listOf("人体解剖学", "大学英语", "医用高等数学", "基础化学", "医学导论", "体育").mapIndexed { i, name -> buildJsonObject {
            put("name", name); put("weekday", i % 5 + 1); put("start_node", if (i % 2 == 0) 1 else 3); put("end_node", if (i % 2 == 0) 2 else 4)
            put("start_time", if (i % 2 == 0) "08:00" else "10:10"); put("end_time", if (i % 2 == 0) "09:40" else "11:50")
            put("location", "教学楼 ${201 + i}"); put("teachers", "示例教师"); put("weeks", JsonArray((1..20).map { JsonPrimitive(it) }))
        } }
        grades = buildJsonObject {
            put("summary", payload("weighted_gpa" to "3.82", "required_gpa" to "3.90", "average_score" to "88.6", "required_average_score" to "89.2", "total_credits" to "18", "total_courses" to "6", "failed_count" to "0"))
            put("grades", JsonArray(courses.mapIndexed { i, c -> buildJsonObject {
                put("name", c.text("name")); put("semester", "2025-2026-1"); put("credits", 3); put("raw_score", "${94 - i * 2}"); put("grade_point", "${4.4 - i * 0.2}")
                put("ranking", buildJsonObject { put("course_rank", 12); put("course_total", 240); put("class_rank", 3); put("class_total", 40); put("distribution", buildJsonObject { put("lt60", 2); put("s60to70", 15); put("s70to80", 48); put("s80to90", 105); put("gte90", 70) }) })
            } }))
        }
    }
}
