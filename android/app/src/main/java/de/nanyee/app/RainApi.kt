// Adapted from AneryCoft/course_helper (GPL-3.0), lib/api/{login,course,api_service}.dart and lib/session/cookie.dart.
package de.nanyee.app

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal interface RainStore { fun read(key: String): String; fun write(key: String, value: String); fun clear() }
internal class EncryptedRainStore(context: Context) : RainStore {
    private val prefs = EncryptedSharedPreferences.create(context, "rain_classroom_private", MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(), EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    override fun read(key: String) = prefs.getString(key, "").orEmpty()
    override fun write(key: String, value: String) { check(prefs.edit().putString(key, value).commit()) }
    override fun clear() { check(prefs.edit().clear().commit()) }
}
internal class RainCookies(private val store: RainStore, private val host: RainHost) : CookieJar {
    private val origin = "https://${host.domain}/".toHttpUrl()
    private val key = "cookies.${host.name}"
    private var enabled = true
    private fun scoped(cookie: Cookie) = (if (cookie.hostOnly) cookie.domain == host.domain else host.domain == cookie.domain || host.domain.endsWith(".${cookie.domain}"))
    private val cookies = store.read(key).lineSequence().mapNotNull { Cookie.parse(origin, it) }.filter { scoped(it) }.toMutableList()
    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (!enabled || url.host != host.domain || !url.isHttps || cookies.isEmpty()) return
        cookies.filter(::scoped).forEach { cookie ->
            this.cookies.removeAll { it.name == cookie.name && it.domain == cookie.domain && it.path == cookie.path }
            if (cookie.expiresAt > System.currentTimeMillis()) this.cookies.add(cookie)
        }
        store.write(key, this.cookies.joinToString("\n"))
    }
    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> = if (!enabled || url.host != host.domain || !url.isHttps) emptyList() else cookies.filter { it.expiresAt > System.currentTimeMillis() && it.matches(url) }
    fun value(name: String, url: HttpUrl = origin) = loadForRequest(url).firstOrNull { it.name == name }?.value.orEmpty()
    @Synchronized fun disable() { enabled = false; cookies.clear() }
}
internal class RainApi(private val store: RainStore, private val host: RainHost, transport: Call.Factory? = null, assets: Call.Factory? = null, sockets: WebSocket.Factory? = null, private val clock: () -> Long = System::currentTimeMillis) : RainBackend {
    private val cookies = RainCookies(store, host)
    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).connectTimeout(15, TimeUnit.SECONDS).readTimeout(35, TimeUnit.SECONDS).callTimeout(40, TimeUnit.SECONDS).build()
    private val transport = transport ?: client
    private val assets = assets ?: rainAssetClient()
    private val sockets = sockets ?: client.newBuilder().cookieJar(cookies).build()
    private var owner = store.read("owner.${host.name}")
    private var retryAt = 0L
    private fun request(path: String, body: JsonObject? = null, lesson: RainLesson? = null): Request {
        if (lesson != null) require(lesson.host == host && lesson.uid == owner && lesson.bearer.isNotBlank())
        return rainRequest(host, path, body, lesson?.bearer.orEmpty(), owner, cookies.value("csrftoken"), cookies.value("sessionid"))
    }
    private suspend fun readResponse(request: Request, write: Boolean = false): Pair<JsonObject, String> {
        if (clock() < retryAt) throw RainFailure("RATE", "雨课堂限流，请稍后手动重试。")
        try {
            return withContext(Dispatchers.IO) {
                classroomResponse(transport, request, cookies, allowed = { it.isHttps && it.host == host.domain && it.port == 443 }, prepare = { next ->
                    next.newBuilder().removeHeader("x-csrftoken").removeHeader("sessionid").apply {
                        cookies.value("csrftoken", next.url).takeIf { it.isNotBlank() }?.let { header("x-csrftoken", it) }
                        cookies.value("sessionid", next.url).takeIf { it.isNotBlank() }?.let { header("sessionid", it) }
                    }.build()
                }) { response ->
                    if (response.code == 429) { retryAt = platformRetryAt(response.header("Retry-After"), clock()); throw RainFailure("RATE", "雨课堂限流，请稍后手动重试。") }
                    if (response.code in setOf(401, 403)) throw RainFailure("SESSION", "雨课堂会话失效，请扫码登录；提交不会自动重试。")
                    if (!response.isSuccessful) throw RainFailure(if (write) "UNKNOWN" else "UPSTREAM", "雨课堂响应异常，请在官方客户端核验。")
                    val source = response.body?.source() ?: throw RainFailure(if (write) "UNKNOWN" else "FORMAT", "雨课堂响应为空。")
                    source.request(4 * 1024 * 1024L + 1)
                    if (source.buffer.size > 4 * 1024 * 1024L) throw RainFailure(if (write) "UNKNOWN" else "FORMAT", "雨课堂响应过大。")
                    val content = source.readUtf8()
                    if (content.trimStart().startsWith("<")) throw RainFailure(if (write) "UNKNOWN" else "SESSION", "雨课堂会话失效，请扫码登录；提交不会自动重试。")
                    val data = runCatching { Json.parseToJsonElement(content).jsonObject }.getOrElse { throw RainFailure(if (write) "UNKNOWN" else "FORMAT", "雨课堂响应格式有变。") }
                    data to response.header("set-auth").orEmpty()
                }
            }
        } catch (_: ClassroomRedirectFailure) { throw RainFailure(if (write) "UNKNOWN" else "REDIRECT", "雨课堂重定向异常，请使用官方客户端核验；提交不会自动重试。") }
        catch (_: IOException) { throw RainFailure(if (write) "UNKNOWN" else "NETWORK", "无法连接雨课堂；若刚提交，请先在官方客户端核验结果。") }
    }
    private suspend fun read(path: String, lesson: RainLesson? = null) = readResponse(request(path, lesson = lesson)).first
    private suspend fun write(path: String, body: JsonObject, lesson: RainLesson? = null) = readResponse(request(path, body, lesson), write = true)
    override suspend fun user(): RainUser {
        val response = read("/v/course_meta/user_info")
        val profile = ((response["data"] as? JsonObject)?.get("user_profile") as? JsonObject) ?: throw RainFailure("SESSION", "雨课堂未登录或已过期，请扫码登录。")
        val id = profile.text("user_id")
        if (("code" in response && rainCode(response) != 0) || !id.matches(Regex("[0-9]+"))) throw RainFailure("SESSION", "雨课堂未登录或已过期，请扫码登录。")
        owner = id; store.write("owner.${host.name}", id)
        return RainUser(id, xxtPlain(profile.text("name")).ifBlank { "本人账号" })
    }
    private suspend fun own(uid: String) { if (user().id != uid) throw RainFailure("SESSION", "雨课堂账号已变更，请重新加载并确认。") }
    private suspend fun own(lesson: RainLesson) { require(lesson.host == host); own(lesson.uid) }
    override suspend fun qr(): RainQr { owner = ""; store.write("owner.${host.name}", ""); return rainQr(read("/api/v3/user/login/pre-info")) }
    override suspend fun poll(qr: RainQr): Boolean {
        val result = readResponse(request("/api/v3/user/login", buildJsonObject { put("token", qr.token) })).first
        return when (rainCode(result)) { 0 -> true; 50001 -> false; else -> throw RainFailure("LOGIN", "二维码授权未完成，请重新获取二维码。") }
    }
    override suspend fun courses() = rainCourses(read("/v/course_meta/learning_list/"))
    override suspend fun onLesson() = rainOnLesson(read("/api/v3/classroom/on-lesson"))
    override suspend fun scan(user: RainUser, url: String): String {
        rainScanUrl(host, url); own(user.id)
        val value = write("/api/v3/app/scan", buildJsonObject { put("url", url) }).first
        if (rainResult(value) == RainResult.REJECTED) throw RainFailure("REJECTED", "课堂码未被接受，请使用当前服务器的有效课堂码。")
        val id = (value["data"] as? JsonObject)?.text("value").orEmpty()
        if (rainResult(value) != RainResult.SUCCESS || id.isBlank()) throw RainFailure("UNKNOWN", "扫码结果未知，请在官方雨课堂核验；不会自动签到。")
        return id
    }
    override suspend fun join(user: RainUser, lessonId: String): RainLesson {
        require(lessonId.isNotBlank()); own(user.id)
        val (value, bearer) = write("/api/v3/lesson/checkin", buildJsonObject { put("source", 21); put("lessonId", lessonId); put("joinIfNotIn", true) })
        if (rainResult(value) == RainResult.REJECTED) throw RainFailure("REJECTED", "课堂签到未被接受，请检查课堂是否仍在进行。")
        val token = (value["data"] as? JsonObject)?.text("lessonToken").orEmpty()
        if (rainResult(value) != RainResult.SUCCESS || token.isBlank() || bearer.isBlank()) throw RainFailure("UNKNOWN", "课堂签到已返回但凭据不完整，请在官方雨课堂核验，切勿直接重复签到。")
        return RainLesson(host, user.id, lessonId, bearer, token)
    }
    override suspend fun eligibility(lesson: RainLesson) = rainEligibility(read("/api/v3/lesson/location-checkin/eligibility", lesson))
    override suspend fun locate(action: RainAction.Location): RainResult {
        own(action.lesson)
        if (eligibility(action.lesson) != action.eligibility) throw RainFailure("CHANGED", "位置签到状态有变，请刷新后重新确认。")
        rainValidate(action, clock())
        return rainResult(write("/api/v3/lesson/location-checkin/submit", buildJsonObject { put("lat", action.position.latitude); put("lng", action.position.longitude); put("lessonId", action.lesson.id); put("source", 54); put("address", action.eligibility.address) }, action.lesson).first)
    }
    override suspend fun presentation(lesson: RainLesson, id: String): RainPresentation {
        val path = "/api/v3/lesson/presentation/fetch?presentation_id=${xxtEncode(id)}"
        return rainPresentation(id, rainData(read(path, lesson)).jsonObject)
    }
    override suspend fun answer(action: RainAction.Answer): RainResult {
        own(action.lesson)
        val body = rainAnswerBody(action, clock())
        return rainResult(write(if (action.retry) "/api/v3/lesson/problem/retry" else "/api/v3/lesson/problem/answer", body, action.lesson).first)
    }
    override suspend fun image(url: String): ByteArray = withContext(Dispatchers.IO) {
        val location = url.toHttpUrl()
        require(location.isHttps && location.port == 443 && location.username.isEmpty() && location.password.isEmpty())
        try {
            assets.newCall(Request.Builder().url(location).build()).awaitResult { response ->
                if (!response.isSuccessful || !response.header("Content-Type").orEmpty().startsWith("image/")) throw RainFailure("IMAGE", "幻灯片图片不可用；不会转发登录凭据到图片服务器。")
                val source = response.body?.source() ?: throw RainFailure("IMAGE", "图片为空。")
                source.request(12 * 1024 * 1024L + 1)
                if (source.buffer.size > 12 * 1024 * 1024L) throw RainFailure("IMAGE", "图片超过 12 MB，已停止加载。")
                source.readByteArray()
            }
        } catch (_: IOException) { throw RainFailure("IMAGE", "图片下载失败，请手动重试。") }
    }
    override fun connect(lesson: RainLesson, frame: (RainFrame) -> Unit, ended: () -> Unit): RainLive {
        require(lesson.host == host && lesson.uid == owner)
        val stopped = AtomicBoolean(false)
        val socket = sockets.newWebSocket(request("/wsapp/").newBuilder().url("wss://${host.domain}/wsapp/").build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) { if (stopped.get()) { webSocket.send(rainLeave(lesson)); webSocket.close(1000, "Leaving") } else webSocket.send(rainHello(lesson)) }
            override fun onMessage(webSocket: WebSocket, text: String) {
                if (stopped.get()) return
                if (text.length > 1024 * 1024) { webSocket.close(1009, "Too large"); ended(); return }
                val parsed = runCatching { rainFrame(Json.parseToJsonElement(text).jsonObject) }.getOrNull()
                if (parsed != null) frame(parsed)
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { if (!stopped.get()) ended() }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { if (!stopped.get()) ended() }
            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, null) }
        })
        return object : RainLive { override fun close() { if (stopped.compareAndSet(false, true)) { socket.send(rainLeave(lesson)); socket.close(1000, "Leaving") } } }
    }
    fun disable() { cookies.disable() }
    override suspend fun clear() { cookies.disable(); withContext(Dispatchers.IO) { store.clear() } }
}
internal fun rainPublicAddress(address: java.net.InetAddress): Boolean {
    if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress || address.isSiteLocalAddress || address.isMulticastAddress) return false
    val bytes = address.address.map { it.toInt() and 255 }
    return if (bytes.size == 16) bytes[0] in 0x20..0x3f else bytes[0] in 1..223 && !(bytes[0] == 100 && bytes[1] in 64..127) && !(bytes[0] == 198 && bytes[1] in 18..19)
}
internal fun rainAssetClient(): OkHttpClient = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).callTimeout(30, TimeUnit.SECONDS).dns(object : Dns {
    override fun lookup(hostname: String) = Dns.SYSTEM.lookup(hostname).also { addresses -> if (addresses.isEmpty() || addresses.any { !rainPublicAddress(it) }) throw java.net.UnknownHostException("Non-public image host") }
}).build()
