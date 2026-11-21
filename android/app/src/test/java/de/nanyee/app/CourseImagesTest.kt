package de.nanyee.app

import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import okio.Timeout
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class CourseImagesTest {
    private class Transport(val body: ResponseBody = byteArrayOf(1, 2, 3).toResponseBody(), val code: Int = 200, val fail: Boolean = false, val pending: Boolean = false) : Call.Factory {
        val requests = mutableListOf<Request>()
        var cancelled = false
        override fun newCall(request: Request): Call {
            requests.add(request)
            return object : Call {
                override fun request() = request
                override fun execute(): Response = error("Only asynchronous calls")
                override fun enqueue(callback: Callback) {
                    if (pending) return
                    if (fail) callback.onFailure(this, IOException("offline"))
                    else callback.onResponse(this, Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(code).message("fixture").body(body).build())
                }
                override fun cancel() { cancelled = true }
                override fun isCanceled() = cancelled
                override fun isExecuted() = true
                override fun timeout() = Timeout.NONE
                override fun clone(): Call = newCall(request)
            }
        }
    }
    private val url = "https://images.example/course.png"

    @Test fun publicImageFetchIsBoundedAndDoesNotCarryAccountCredentials() = runBlocking<Unit> {
        val transport = Transport()
        assertArrayEquals(byteArrayOf(1, 2, 3), courseImageBytes(url, transport))
        val request = transport.requests.single()
        assertEquals("GET", request.method); assertNull(request.header("Cookie")); assertNull(request.header("Authorization"))
        assertNull(courseImageBytes(url, Transport(code = 404)))
        assertArrayEquals(byteArrayOf(), courseImageBytes(url, Transport(body = byteArrayOf().toResponseBody())))
        assertNull(courseImageBytes(url, Transport(body = ByteArray(2 * 1024 * 1024 + 1).toResponseBody())))
        val chunked = object : ResponseBody() {
            private val data = Buffer().write(ByteArray(2 * 1024 * 1024 + 1))
            override fun contentType(): MediaType? = null
            override fun contentLength() = -1L
            override fun source() = data
        }
        assertNull(courseImageBytes(url, Transport(body = chunked)))
        assertTrue(runCatching { courseImageBytes(url, Transport(fail = true)) }.exceptionOrNull() is IOException)
    }
    @Test fun emptyUnsafeAndDemoImagesFallBackWithoutNetwork() = runBlocking<Unit> {
        val never = Call.Factory { error("No network allowed") }
        for (value in listOf("", "not a URL", "file:///a", "https://user:secret@images.example/a")) assertNull(courseImageBytes(value, never))
        val demoImages = DemoXxtBackend().courses().map { it.image } + DemoRainBackend(RainHost.CHANGJIANG).courses().map { it.teacherAvatar }
        assertTrue(demoImages.all { it.startsWith("https://") && it.contains(".invalid/") })
        demoImages.forEach { assertNull(courseImageBytes(it, never)) }
    }
    @Test fun legacyHttpImageUrlsAreUpgradedWithoutAllowingCleartext() = runBlocking<Unit> {
        val transport = Transport()
        assertNotNull(courseImageBytes("http://images.example/a.png", transport))
        assertEquals("https://images.example/a.png", transport.requests.single().url.toString())
    }
    @Test fun leavingTheRowCancelsThePendingImageCall() = runBlocking<Unit> {
        val transport = Transport(pending = true)
        val pending = launch(start = CoroutineStart.UNDISPATCHED) { courseImageBytes(url, transport) }
        assertEquals(1, transport.requests.size)
        pending.cancelAndJoin()
        assertTrue(transport.cancelled)
    }
}
