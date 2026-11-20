// Adapted from AneryCoft/course_helper (GPL-3.0), lib/api/api_service.dart and lib/pages/login.dart.
package de.nanyee.app

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.ensureActive
import okhttp3.Call
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.Request
import okhttp3.Response

internal class ClassroomRedirectFailure : Exception("课堂请求重定向异常，请重新登录或使用官方客户端。")
private sealed interface ClassroomResponse<out T> {
    data class Redirect(val request: Request) : ClassroomResponse<Nothing>
    data class Value<T>(val value: T) : ClassroomResponse<T>
}

internal suspend fun <T> classroomResponse(
    transport: Call.Factory, initial: Request, cookies: CookieJar, allowed: (HttpUrl) -> Boolean,
    prepare: (Request) -> Request = { it }, parse: (Response) -> T
): T {
    var request = initial
    for (hop in 0..3) {
        currentCoroutineContext().ensureActive()
        if (!allowed(request.url)) throw ClassroomRedirectFailure()
        val outgoing = prepare(request).newBuilder().removeHeader("Cookie").apply {
            val values = cookies.loadForRequest(request.url)
            if (values.isNotEmpty()) header("Cookie", values.joinToString("; ") { "${it.name}=${it.value}" })
        }.build()
        val result = transport.newCall(outgoing).awaitResult { response ->
            cookies.saveFromResponse(outgoing.url, Cookie.parseAll(outgoing.url, response.headers))
            val location = response.header("Location")
            if (response.code in 200..399 && location != null) {
                val target = outgoing.url.resolve(location)
                if (hop == 3 || target == null || !allowed(target)) throw ClassroomRedirectFailure()
                ClassroomResponse.Redirect(outgoing.newBuilder().url(target).get().removeHeader("Content-Type").removeHeader("Cookie").apply {
                    if (target.host != outgoing.url.host) {
                        listOf("Authorization", "x-uid", "x-csrftoken", "sessionid").forEach { removeHeader(it) }
                    }
                }.build())
            } else ClassroomResponse.Value(parse(response))
        }
        when (result) {
            is ClassroomResponse.Redirect -> request = result.request
            is ClassroomResponse.Value -> return result.value
        }
    }
    throw ClassroomRedirectFailure()
}

internal sealed interface ClassroomQrResult<out T> {
    data object Waiting : ClassroomQrResult<Nothing>
    data object Expired : ClassroomQrResult<Nothing>
    data class Authorized<T>(val user: T) : ClassroomQrResult<T>
}

internal fun classroomSmsResendSeconds(deadline: Long, now: Long) = ((deadline - now).coerceAtLeast(0) + 999).div(1000).coerceAtMost(60).toInt()

internal const val CLASSROOM_QR_POLL_MILLIS = 3000L

internal suspend fun <Q, T> renewingClassroomQr(
    initial: Q, refresh: suspend () -> Q, show: (Q) -> Unit,
    attempts: Int = 90, pause: suspend () -> Unit = { delay(CLASSROOM_QR_POLL_MILLIS) },
    poll: suspend (Q) -> ClassroomQrResult<T>
): T {
    require(attempts > 0)
    var qr = initial
    while (true) {
        currentCoroutineContext().ensureActive()
        show(qr)
        for (attempt in 0 until attempts) {
            pause()
            currentCoroutineContext().ensureActive()
            val result = poll(qr)
            currentCoroutineContext().ensureActive()
            when (result) {
                is ClassroomQrResult.Authorized -> return result.user
                ClassroomQrResult.Expired -> break
                ClassroomQrResult.Waiting -> Unit
            }
        }
        currentCoroutineContext().ensureActive()
        qr = refresh()
    }
}
