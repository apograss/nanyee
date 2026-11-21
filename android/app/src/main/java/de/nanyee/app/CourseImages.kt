package de.nanyee.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.produceState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Request
import java.net.InetAddress
import java.util.concurrent.TimeUnit

private const val CourseImageLimit = 2L * 1024 * 1024
internal fun courseImageClient() = rainAssetClient().newBuilder().callTimeout(10, TimeUnit.SECONDS).build()
private val defaultCourseImageClient by lazy { courseImageClient() }

internal suspend fun courseImageBytes(url: String, transport: Call.Factory = defaultCourseImageClient): ByteArray? {
    val parsed = url.toHttpUrlOrNull() ?: return null
    if (parsed.username.isNotBlank() || parsed.password.isNotBlank() || parsed.host.endsWith(".invalid")) return null
    val address = if (parsed.scheme == "http") parsed.newBuilder().scheme("https").build() else parsed
    if (address.scheme != "https") return null
    if ((address.host.contains(':') || address.host.matches(Regex("[0-9.]+"))) &&
        !rainPublicAddress(InetAddress.getByName(address.host))) return null
    return transport.newCall(Request.Builder().url(address).build()).awaitResult { response ->
        val body = response.body
        if (!response.isSuccessful || body == null || body.contentLength() > CourseImageLimit) null
        else body.source().let { source -> if (source.request(CourseImageLimit + 1)) null else source.readByteArray() }
    }
}

private fun courseThumbnail(bytes: ByteArray): Bitmap? {
    val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    if (options.outWidth !in 1..20000 || options.outHeight !in 1..20000) return null
    options.inJustDecodeBounds = false
    options.inSampleSize = 1
    while (maxOf(options.outWidth, options.outHeight) / options.inSampleSize > 128) options.inSampleSize *= 2
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
}

@Composable
internal fun rememberCourseImage(url: String): Bitmap? = key(url) {
    val bitmap by produceState<Bitmap?>(null) {
        try { value = withContext(Dispatchers.IO) { courseImageBytes(url)?.let(::courseThumbnail) } }
        catch (e: CancellationException) { throw e }
        catch (_: Exception) { value = null }
    }
    bitmap
}
