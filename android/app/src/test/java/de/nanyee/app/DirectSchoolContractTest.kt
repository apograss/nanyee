package de.nanyee.app

import kotlinx.coroutines.runBlocking
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Timeout
import org.junit.Assert.*
import org.junit.Test

class DirectSchoolContractTest {
    private class Transport(private val respond: (Request) -> Response) : Call.Factory {
        val requests = mutableListOf<Request>()
        override fun newCall(request: Request): Call = object : Call {
            private var cancelled = false
            override fun request() = request
            override fun execute(): Response = error("Must use cancellable enqueue")
            override fun enqueue(callback: Callback) { requests += request; callback.onResponse(this, respond(request)) }
            override fun cancel() { cancelled = true }
            override fun isCanceled() = cancelled
            override fun isExecuted() = true
            override fun clone(): Call = newCall(request)
            override fun timeout() = Timeout.NONE
        }
    }
    private fun response(request: Request, body: String, status: Int = 200, vararg headers: Pair<String, String>): Response = Response.Builder()
        .request(request).protocol(Protocol.HTTP_1_1).code(status).message("Fixture").body(body.toResponseBody())
        .apply { headers.forEach { (key, value) -> header(key, value) } }.build()

    @Test fun captchaAndLoginUseOnlyDocumentedSchoolEndpointsAndFields() = runBlocking {
        val transport = Transport { request -> when (request.url.encodedPath) {
            "/imageServlet.do" -> response(request, "fixture-image", 200, "Content-Type" to "image/jpeg")
            "/login/login.do" -> response(request, """{"msg":"badRandcodekey"}""")
            else -> error("Undocumented request")
        } }
        val api: SchoolDataSource = DirectSchoolApi(transport)
        val captcha = api.request("captcha")
        assertTrue(captcha.text("flow_id").isNotEmpty())
        val failure = runCatching { api.request("session", payload("flow_id" to captcha.text("flow_id"), "account" to "not-a-student", "password" to "test", "captcha" to "0123")) }.exceptionOrNull() as SchoolError
        assertEquals("bad_captcha", failure.reason)
        assertEquals(listOf("https://uis.smu.edu.cn/imageServlet.do", "https://uis.smu.edu.cn/login/login.do"), transport.requests.map { it.url.toString() })
        val login = transport.requests.last()
        assertEquals("POST", login.method); assertEquals(UIS, login.header("Origin")); assertEquals("XMLHttpRequest", login.header("X-Requested-With"))
        val form = login.body as FormBody
        assertEquals(schoolLoginForm("not-a-student", "test", "0123"), (0 until form.size).associate { form.name(it) to form.value(it) })
        assertTrue(runCatching { api.request("session", payload("flow_id" to captcha.text("flow_id"))) }.exceptionOrNull() is SchoolError)
        assertEquals(2, transport.requests.size)
    }

    @Test fun retryAfterPreventsMoreNetworkCalls() = runBlocking {
        val transport = Transport { response(it, "", 429, "Retry-After" to "120") }
        val api: SchoolDataSource = DirectSchoolApi(transport)
        repeat(2) { assertEquals(429, (runCatching { api.request("captcha") }.exceptionOrNull() as SchoolError).status) }
        assertEquals(1, transport.requests.size)
    }

    @Test fun ssoNeverFollowsAnUntrustedRedirect() = runBlocking {
        val transport = Transport { request -> when (request.url.encodedPath) {
            "/imageServlet.do" -> response(request, "fixture-image", 200, "Content-Type" to "image/jpeg")
            "/login/login.do" -> response(request, """{"ticket":"fixture-ticket"}""")
            "/new/ssoLogin" -> response(request, "", 302, "Location" to "https://untrusted.example.test/")
            else -> error("Undocumented request")
        } }
        val api: SchoolDataSource = DirectSchoolApi(transport)
        val captcha = api.request("captcha")
        assertTrue(runCatching { api.request("session", payload("flow_id" to captcha.text("flow_id"))) }.exceptionOrNull() is SchoolError)
        assertEquals(3, transport.requests.size)
        assertEquals("zhjw.smu.edu.cn", transport.requests.last().url.host)
        assertEquals("fixture-ticket", transport.requests.last().url.queryParameter("ticket"))
    }
}
