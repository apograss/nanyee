package de.nanyee.app

import java.net.URI
import kotlinx.serialization.json.*

internal data class AppRelease(val versionCode: Int, val versionName: String, val url: String, val notes: String)

internal fun validReleaseUrl(value: String): Boolean = runCatching {
    val uri = URI(value)
    uri.scheme.equals("https", ignoreCase = true) && uri.host.equals("nanyee.de", ignoreCase = true) &&
        uri.rawUserInfo == null && uri.port in listOf(-1, 443)
}.getOrDefault(false)

internal fun parseAppRelease(value: String): AppRelease? = runCatching {
    val data = Json { isLenient = true; ignoreUnknownKeys = true }.parseToJsonElement(value).jsonObject
    fun text(key: String) = (data[key] as? JsonPrimitive)?.contentOrNull.orEmpty()
    val code = text("versionCode").toInt()
    val name = text("versionName").trim()
    val url = text("url")
    require(code > 0 && name.isNotEmpty() && name.length <= 80 && validReleaseUrl(url))
    AppRelease(code, name, url, text("notes").take(4000))
}.getOrNull()

internal fun updateCheckDue(now: Long, last: Long, manual: Boolean = false) = manual || last == 0L || (now >= last && now - last >= 86_400_000L)
internal fun offerUpdate(release: AppRelease, current: Int, dismissed: Int, manual: Boolean = false) =
    release.versionCode > current && (manual || release.versionCode != dismissed)
