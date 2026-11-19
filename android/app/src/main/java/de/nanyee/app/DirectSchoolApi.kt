package de.nanyee.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.UUID
import java.util.Base64
import java.util.concurrent.TimeUnit

internal class DirectSchoolApi(private val transport: Call.Factory? = null) : SchoolDataSource {
    private val cookies = mutableListOf<Cookie>()
    private var flow = ""
    private var flowExpires = Instant.EPOCH
    private var session = ""
    private var retryAt = Instant.EPOCH
    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).callTimeout(60, TimeUnit.SECONDS)
        .cookieJar(object : CookieJar {
            override fun saveFromResponse(url: HttpUrl, incoming: List<Cookie>) = synchronized(cookies) {
                incoming.forEach { next -> cookies.removeAll { it.name == next.name && it.domain == next.domain && it.path == next.path }; cookies.add(next) }
            }
            override fun loadForRequest(url: HttpUrl) = synchronized(cookies) { cookies.filter { it.matches(url) && it.expiresAt > System.currentTimeMillis() } }
        }).build()

    override fun clear() { flow = ""; session = ""; synchronized(cookies) { cookies.clear() } }

    private fun requestBuilder(url: String) = Request.Builder().url(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36")
        .header("Accept-Language", "zh-CN,zh;q=0.9")

    private suspend fun <T> execute(request: Request, parse: (Response) -> T): T {
        if (Instant.now().isBefore(retryAt)) throw SchoolError(429, "RATE_LIMITED", "请求过于频繁，请在 $retryAt 后重试。")
        try {
            return (transport ?: client).newCall(request).awaitResult { response ->
                if (response.code == 429) {
                    val retry = response.header("Retry-After")
                    retryAt = retry?.toLongOrNull()?.let { Instant.now().plusSeconds(it.coerceAtLeast(0)) }
                        ?: runCatching { ZonedDateTime.parse(retry, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant() }.getOrDefault(Instant.now().plusSeconds(60))
                    throw SchoolError(429, "RATE_LIMITED", "请求过于频繁，请稍后重试。\nRetry-After：${retry ?: "60"}")
                }
                parse(response)
            }
        } catch (e: java.io.IOException) { throw SchoolError(0, "NETWORK", "无法连接学校系统，请检查网络后重试。") }
    }

    private fun content(response: Response): String {
        if (response.code in listOf(401, 403) || response.isRedirect) throw SchoolError(410, "SESSION_EXPIRED", "学校会话已过期，请重新登录。")
        if (response.code != 200) throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校系统暂时不可用，请稍后重试。")
        if ((response.body?.contentLength() ?: 0) > 4 * 1024 * 1024) throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校响应过大。")
        response.body?.source()?.let { source ->
            source.request(4 * 1024 * 1024 + 1L)
            if (source.buffer.size > 4 * 1024 * 1024) throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校响应过大。")
        }
        val text = response.body?.string().orEmpty()
        if (text.length > 4 * 1024 * 1024) throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校响应过大。")
        if (listOf("统一认证登录", "扫码登录", "密码登录").all { it in text }) throw SchoolError(410, "SESSION_EXPIRED", "学校会话已过期，请重新登录。")
        return text
    }

    private suspend fun page(url: String, academicOnly: Boolean = false): String {
        var current = url.toHttpUrl()
        repeat(5) {
            val hop = execute(requestBuilder(current.toString()).header("Accept", "text/html,*/*").header("Referer", "$ACADEMIC/").build()) { response ->
                if (response.isRedirect && response.header("Location") != null) null to response.header("Location") else content(response) to null
            }
            if (hop.first != null) return hop.first!!
            val next = current.resolve(hop.second!!) ?: throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校跳转无效。")
            if (next.scheme != "https" || next.host !in if (academicOnly) setOf("zhjw.smu.edu.cn") else setOf("zhjw.smu.edu.cn", "uis.smu.edu.cn")) throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校跳转地址无效。")
            current = next
        }
        throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校跳转次数过多。")
    }

    private suspend fun post(path: String, fields: Map<String, String>, referer: String): JsonElement {
        val body = FormBody.Builder().apply { fields.forEach { (key, value) -> add(key, value) } }.build()
        return execute(requestBuilder("$ACADEMIC$path").header("Referer", referer).post(body).build()) { Json.parseToJsonElement(content(it)) }
    }

    override suspend fun request(path: String, body: JsonObject?): JsonObject = withContext(Dispatchers.IO) {
        try {
            when (path) {
                "captcha" -> {
                    synchronized(cookies) { cookies.removeAll { it.domain == "uis.smu.edu.cn" } }
                    val encoded = execute(requestBuilder("$UIS/imageServlet.do").header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8").header("Referer", "$UIS/login.jsp?outLine=0").build()) { response ->
                        if (response.code != 200 || response.header("Content-Type")?.substringBefore(';') !in setOf("image/jpeg", "image/png", "image/webp")) throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校验证码暂时无法读取。")
                        val bytes = response.body?.bytes() ?: byteArrayOf()
                        require(bytes.isNotEmpty() && bytes.size <= 1024 * 1024)
                        Base64.getEncoder().encodeToString(bytes)
                    }
                    flow = UUID.randomUUID().toString(); flowExpires = Instant.now().plusSeconds(300)
                    payload("flow_id" to flow, "image_base64" to encoded, "expires_at" to flowExpires.toString())
                }
                "session" -> {
                    if (flow.isEmpty() || body?.text("flow_id") != flow || Instant.now().isAfter(flowExpires)) throw SchoolError(410, "FLOW_EXPIRED", "验证码已过期，请重新输入。")
                    flow = ""
                    val fields = schoolLoginForm(body.text("account"), body.text("password"), body.text("captcha"))
                    val form = FormBody.Builder().apply { fields.forEach { (key, value) -> add(key, value) } }.build()
                    val ticket = execute(requestBuilder("$UIS/login/login.do").header("Origin", UIS).header("Referer", "$UIS/login.jsp?redirect=https%3A%2F%2Fzhjw.smu.edu.cn%2Fnew%2FssoLogin").header("X-Requested-With", "XMLHttpRequest").post(form).build()) { response -> schoolLoginTicket(Json.parseToJsonElement(content(response)).obj()) }
                    synchronized(cookies) { cookies.removeAll { it.domain == "zhjw.smu.edu.cn" } }
                    page("$ACADEMIC/new/ssoLogin".toHttpUrl().newBuilder().addQueryParameter("ticket", ticket).build().toString(), academicOnly = true)
                    if (synchronized(cookies) { cookies.none { it.domain == "zhjw.smu.edu.cn" } }) throw SchoolError(401, "UPSTREAM_REJECTED", "无法建立学校会话，请重试。")
                    session = UUID.randomUUID().toString()
                    payload("academic_session_id" to session, "expires_at" to Instant.now().plusSeconds(1800).toString())
                }
                else -> {
                    checkSession(body)
                    when (path) {
                        "timetable.semesters" -> {
                            val code = defaultSemester()
                            val semesters = schoolSemesters(page("$ACADEMIC/new/student/xsgrkb/week.page?xnxqdm=$code"))
                            require(semesters.isNotEmpty())
                            buildJsonObject { put("default_code", code); put("semesters", JsonArray(semesters)) }
                        }
                        "timetable" -> {
                            val code = body!!.text("semester_code").ifEmpty { defaultSemester() }
                            require(code.matches(Regex("\\d{6}")))
                            val weeks = body.number("total_weeks"); require(weeks in 1..30)
                            val semaphore = Semaphore(5)
                            val rows = coroutineScope {
                                (1..weeks).map { week -> async { semaphore.withPermit {
                                    schoolWeeklyRows(post("/new/student/xsgrkb/getCalendarWeekDatas", mapOf("xnxqdm" to code, "zc" to week.toString()), "$ACADEMIC/new/student/xsgrkb/main.page"))
                                } } }.awaitAll().flatten()
                            }
                            buildJsonObject { put("semester_code", code); put("courses", JsonArray(schoolTimetable(rows))) }
                        }
                        "grades" -> {
                            page("$ACADEMIC/new/student/xskccj/kccjList.page")
                            val rawBody = "xnxqdm=&source=kccjlist&ismax=1&primarySort=+cjdm+desc+&page=1&rows=500&sort=xnxqdm%2Ckcmc&order=desc%2Casc"
                            val data = execute(requestBuilder("$ACADEMIC/new/student/xskccj/kccjDatas").header("Accept", "application/json, text/javascript, */*; q=0.01").header("Origin", ACADEMIC).header("Referer", "$ACADEMIC/new/student/xskccj/kccjList.page").header("X-Requested-With", "XMLHttpRequest").post(rawBody.toRequestBody("application/x-www-form-urlencoded; charset=UTF-8".toMediaType())).build()) { Json.parseToJsonElement(content(it)).obj() }
                            val semaphore = Semaphore(5)
                            val grades = coroutineScope { schoolGrades(data).map { grade -> async { semaphore.withPermit {
                                val ranking = if (grade.text("grade_id").isEmpty()) null else try {
                                    schoolRanking(page("$ACADEMIC/new/student/xskccj/kccjfxd.page".toHttpUrl().newBuilder().addQueryParameter("cjdm", grade.text("grade_id")).build().toString()))
                                } catch (e: Exception) { if (e is CancellationException) throw e; null }
                                if (ranking == null) grade else JsonObject(grade + ("ranking" to ranking))
                            } } }.awaitAll() }
                            buildJsonObject { put("summary", gradeSummary(grades)); put("grades", JsonArray(grades)) }
                        }
                        else -> throw SchoolError(0, "INVALID_REQUEST", "不支持的学校查询。")
                    }
                }
            }
        } catch (e: CancellationException) { throw e }
        catch (e: SchoolError) { throw e }
        catch (e: Exception) { throw SchoolError(503, "UPSTREAM_UNAVAILABLE", "学校响应暂时无法读取，请稍后重试。") }
    }

    private fun checkSession(body: JsonObject?) {
        if (session.isEmpty() || body?.text("academic_session_id") != session) throw SchoolError(410, "SESSION_EXPIRED", "学校会话已过期，请重新登录。")
    }

    private suspend fun defaultSemester(): String = Regex("xnxqdm=(\\d{6})").find(page("$ACADEMIC/new/student/xsgrkb/main.page"))?.groupValues?.get(1)
        ?: throw SchoolError(410, "SESSION_EXPIRED", "学校会话已过期，请重新登录。")

    override suspend fun timetableSemesterStart(body: JsonObject): String = withContext(Dispatchers.IO) {
        checkSession(body)
        val code = body.text("semester_code"); require(code.matches(Regex("\\d{6}")))
        schoolSemesterStart(post("/new/xlxx/getDatesOfWeek", mapOf("xnxqdm" to code, "zc" to "1"), "$ACADEMIC/new/student/xsgrkb/week.page?xnxqdm=$code"))
    }
}
