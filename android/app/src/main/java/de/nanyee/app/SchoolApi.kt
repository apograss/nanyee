package de.nanyee.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

fun JsonElement.obj() = this as? JsonObject ?: JsonObject(emptyMap())
fun JsonObject.text(key: String) = (get(key) as? JsonPrimitive)?.contentOrNull ?: ""
fun JsonObject.number(key: String) = text(key).toIntOrNull() ?: 0
fun JsonObject.items(key: String) = (get(key) as? JsonArray)?.map { it.obj() } ?: emptyList()
fun payload(vararg fields: Pair<String, String>) = buildJsonObject { fields.forEach { put(it.first, it.second) } }

class SchoolError(val status: Int, val code: String, message: String) : Exception(message)

class SchoolApi {
    private val cookies = mutableListOf<Cookie>()
    private var retryAt = 0L
    private val client = OkHttpClient.Builder().callTimeout(60, TimeUnit.SECONDS).cookieJar(object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, incoming: List<Cookie>) = synchronized(cookies) {
            incoming.forEach { next -> cookies.removeAll { it.name == next.name && it.domain == next.domain && it.path == next.path }; cookies.add(next) }
        }
        override fun loadForRequest(url: HttpUrl): List<Cookie> = synchronized(cookies) {
            cookies.removeAll { it.expiresAt <= System.currentTimeMillis() }
            cookies.filter { it.matches(url) }
        }
    }).build()

    fun clear() { synchronized(cookies) { cookies.clear() } }

    suspend fun request(path: String, body: JsonObject? = null): JsonObject = withContext(Dispatchers.IO) {
        if (System.currentTimeMillis() < retryAt) throw SchoolError(429, "RATE_LIMITED", "请求过于频繁，请在 ${(retryAt - System.currentTimeMillis()) / 1000 + 1} 秒后重试。")
        val url = "https://nanyee.de/api/v1/smu/$path"
        val builder = Request.Builder().url(url)
        if (body != null) {
            builder.post(body.toString().toRequestBody("application/json".toMediaType()))
            synchronized(cookies) { cookies.lastOrNull { it.name == "nanyee_csrf" && it.expiresAt > System.currentTimeMillis() }?.let { builder.header("X-CSRF-Token", it.value) } }
        }
        try {
            client.newCall(builder.build()).execute().use { response ->
                val data = runCatching { Json.parseToJsonElement(response.body?.string() ?: "{}").obj() }.getOrDefault(JsonObject(emptyMap()))
                if (!response.isSuccessful) {
                    val error = data["error"]?.obj() ?: JsonObject(emptyMap())
                    val code = error.text("code")
                    val retry = response.header("Retry-After")
                    if (code == "RATE_LIMITED") {
                        retryAt = retry?.toLongOrNull()?.let { System.currentTimeMillis() + it * 1000 }
                            ?: runCatching { java.time.ZonedDateTime.parse(retry, java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli() }.getOrDefault(System.currentTimeMillis() + 60000)
                    }
                    val message = error.text("message").ifEmpty { "请求失败（${response.code}）" }
                    val advice = when (code) {
                        "RATE_LIMIT_CHALLENGE_REQUIRED" -> "\n请稍后重试，或使用网站 nanyee.de 完成人机验证。"
                        "RATE_LIMITED" -> "\nRetry-After：${retry ?: "60"}"
                        else -> ""
                    }
                    val id = error.text("request_id").ifEmpty { response.header("X-Request-ID") ?: "" }
                    throw SchoolError(response.code, code, message + advice + if (id.isNotEmpty()) "\n请求编号：$id" else "")
                }
                data
            }
        } catch (e: java.io.IOException) { throw SchoolError(0, "NETWORK", "网络连接失败，请检查网络后重试。") }
    }
}
