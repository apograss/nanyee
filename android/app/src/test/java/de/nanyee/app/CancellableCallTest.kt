package de.nanyee.app

import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Timeout
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class CancellableCallTest {
    private class PendingCall : Call {
        var cancelled = false
        lateinit var callback: Callback
        override fun request() = Request.Builder().url("https://example.test").build()
        override fun enqueue(responseCallback: Callback) { callback = responseCallback }
        override fun cancel() { cancelled = true }
        override fun isCanceled() = cancelled
        override fun isExecuted() = ::callback.isInitialized
        override fun timeout() = Timeout.NONE
        override fun clone(): Call = PendingCall()
        override fun execute(): Response = error("Blocking execution is not supported")
        fun respond(body: ResponseBody) = callback.onResponse(this, Response.Builder().request(request()).protocol(Protocol.HTTP_1_1).code(200).message("OK").body(body).build())
    }

    @Test fun cancellationCancelsTransportAndDiscardsLateResponse() = runBlocking {
        val call = PendingCall()
        var parsed = false
        val job = launch(start = CoroutineStart.UNDISPATCHED) { call.awaitResult { parsed = true } }
        job.cancelAndJoin()
        assertTrue(call.cancelled)
        call.respond("late".toResponseBody())
        assertFalse(parsed)
    }

    @Test fun successfulResponseIsParsed() = runBlocking {
        val call = PendingCall()
        val result = async(start = CoroutineStart.UNDISPATCHED) { call.awaitResult { it.body!!.string() } }
        call.respond("{}".toResponseBody())
        assertEquals("{}", result.await())
        assertFalse(call.cancelled)
    }

    @Test fun ioFailureIsPropagated() = runBlocking {
        val call = PendingCall()
        val result = async(start = CoroutineStart.UNDISPATCHED) { runCatching { call.awaitResult { it.code } } }
        call.callback.onFailure(call, IOException("offline"))
        assertEquals("offline", result.await().exceptionOrNull()?.message)
    }
}
