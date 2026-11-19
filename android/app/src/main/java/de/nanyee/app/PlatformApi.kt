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
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

internal interface PlatformBackend {
    suspend fun call(method: String, path: String, body: JsonObject? = null, key: String? = null): JsonElement
    suspend fun clearLocal()
}

internal interface PlatformCookieStorage {
    fun read(): String
    fun write(value: String)
}

internal class EncryptedPlatformCookies(context: Context) : PlatformCookieStorage {
    private val preferences = EncryptedSharedPreferences.create(context, "platform_cookies", MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(), EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    override fun read() = preferences.getString("cookies", "").orEmpty()
    override fun write(value: String) { if (!preferences.edit().putString("cookies", value).commit()) throw IOException("平台登录状态无法安全保存。") }
}

internal class PlatformCookies(private val storage: PlatformCookieStorage) : CookieJar {
    private val origin = "https://nanyee.de/".toHttpUrl()
    private val values = storage.read().lineSequence().mapNotNull { Cookie.parse(origin, it) }.filter { it.name in setOf("nanyee_session", "nanyee_csrf") && it.matches(origin) }.toMutableList()
    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> = if (url.host != origin.host || !url.isHttps) emptyList() else values.filter { it.expiresAt > System.currentTimeMillis() && it.matches(url) }
    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (url.host != origin.host || !url.isHttps) return
        cookies.filter { it.name in setOf("nanyee_session", "nanyee_csrf") }.forEach { next ->
            values.removeAll { it.name == next.name && it.domain == next.domain && it.path == next.path }
            if (next.expiresAt > System.currentTimeMillis()) values.add(next)
        }
        try { storage.write(values.joinToString("\n")) }
        catch (e: Exception) { values.clear(); throw IOException("平台登录状态无法安全保存。", e) }
    }
    @Synchronized fun csrf(): String? = loadForRequest("https://nanyee.de/api/v1/jobs".toHttpUrl()).lastOrNull { it.name == "nanyee_csrf" }?.value
    @Synchronized fun clear() { storage.write(""); values.clear() }
}

internal class PlatformFailure(val status: Int, val code: String, message: String) : Exception(message)

internal fun platformRetryAt(header: String?, now: Long): Long = header?.toLongOrNull()?.coerceAtLeast(0)?.let { seconds ->
    if (seconds > (Long.MAX_VALUE - now) / 1000) Long.MAX_VALUE else now + seconds * 1000
} ?: runCatching { ZonedDateTime.parse(header, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() }.getOrDefault(now + 60000)

internal fun platformErrorMessage(status: Int, code: String): String = when {
    code == "RATE_LIMIT_CHALLENGE_REQUIRED" -> "需要网站人机验证，请稍后重试或前往 nanyee.de 完成操作。"
    status == 429 -> "请求过于频繁，请稍后重试（遵守服务器等待时间）。"
    code == "INVALID_CREDENTIALS" -> "平台用户名或密码错误。"
    status == 401 -> "平台登录已过期，请重新登录。"
    code == "CONFLICT" -> "操作冲突，请刷新并核对已有预约，不要重复提交。"
    status == 422 -> "参数未通过服务器校验，请核对预约与尝试窗口。"
    else -> "平台请求失败，请稍后重试。"
}

internal class PlatformApi(storage: PlatformCookieStorage) : PlatformBackend {
    private val cookies = PlatformCookies(storage)
    private var retryAt = 0L
    private val client = OkHttpClient.Builder().cookieJar(cookies).retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).callTimeout(45, TimeUnit.SECONDS).build()
    override suspend fun clearLocal() = withContext(Dispatchers.IO) { cookies.clear() }
    override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement = withContext(Dispatchers.IO) {
        if (System.currentTimeMillis() < retryAt) throw PlatformFailure(429, "RATE_LIMITED", "请求过于频繁，请在 ${(retryAt - System.currentTimeMillis()) / 1000 + 1} 秒后重试。")
        val csrf = cookies.csrf()
        if (method != "GET" && path != "/auth/login" && csrf.isNullOrBlank()) throw PlatformFailure(401, "AUTHENTICATION_REQUIRED", platformErrorMessage(401, "AUTHENTICATION_REQUIRED"))
        val request = platformRequest(method, path, body, csrf, key)
        try {
            client.newCall(request).awaitResult { response ->
                val content = response.body?.string().orEmpty()
                val data = runCatching { Json.parseToJsonElement(content) }.getOrNull()
                if (!response.isSuccessful) {
                    val code = data?.obj()?.get("error")?.obj()?.text("code").orEmpty()
                    if (response.code == 429) retryAt = platformRetryAt(response.header("Retry-After"), System.currentTimeMillis())
                    throw PlatformFailure(response.code, code, platformErrorMessage(response.code, code))
                }
                if (response.code == 204) JsonNull else data ?: throw PlatformFailure(0, "INVALID_RESPONSE", "平台响应格式无效。")
            }
        } catch (_: IOException) { throw PlatformFailure(0, "NETWORK", "网络连接失败。任务提交可使用原确认重试，请勿重复创建。") }
    }
}
