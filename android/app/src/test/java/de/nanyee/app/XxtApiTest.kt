package de.nanyee.app

import kotlinx.coroutines.runBlocking
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Timeout
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class XxtApiTest {
    private data class Reply(val text: String = "{}", val code: Int = 200, val headers: Map<String, String> = emptyMap(), val fail: Boolean = false)
    private class Script(private val respond: (Request) -> Reply) : Call.Factory {
        val requests = mutableListOf<Request>()
        override fun newCall(request: Request): Call {
            requests.add(request)
            return object : Call {
                private var cancelled = false
                override fun request() = request
                override fun execute(): Response = error("No blocking calls")
                override fun enqueue(responseCallback: Callback) {
                    val reply = respond(request)
                    if (reply.fail) responseCallback.onFailure(this, IOException("sensitive-upstream-details"))
                    else responseCallback.onResponse(this, Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(reply.code).message("fixture").apply { reply.headers.forEach { (k, v) -> addHeader(k, v) } }.body(reply.text.toResponseBody()).build())
                }
                override fun cancel() { cancelled = true }
                override fun isCanceled() = cancelled
                override fun isExecuted() = true
                override fun timeout() = Timeout.NONE
                override fun clone(): Call = newCall(request)
            }
        }
    }
    private fun ordinaryFixture(request: Request): Reply = when (request.url.encodedPath) {
        "/apis/login/userLogin4Uname.do" -> Reply("""{"result":1,"msg":{"puid":12345,"name":"示例本人","clientId":""}}""")
        "/v2/apis/active/getPPTActiveInfo" -> Reply("""{"result":1,"data":{"otherId":0}}""")
        "/v2/apis/sign/getAttendInfo" -> Reply("""{"result":1,"data":{"status":0}}""")
        "/pptSign/stuSignajax" -> Reply("success")
        else -> error("Unexpected fixture path")
    }
    private fun plan() = XxtSignPlan(XxtCourse("101", "201", "301", "示例课程", "示例老师"), XxtActivity("402", "课堂签到", "", 2, true, 1000), XxtSignDetail(0))

    @Test fun ordinarySignUsesOwnSessionAndExactWriteEndpointOnce() = runBlocking {
        val script = Script(::ordinaryFixture); val api = XxtApi(MemoryXxtStorage(), script)
        assertEquals(XxtSignResult.Success, api.sign(XxtUser("12345", "示例本人"), plan()))
        val writes = script.requests.filter { it.url.encodedPath == "/pptSign/stuSignajax" }
        assertEquals(1, writes.size); assertEquals("GET", writes.single().method)
        assertEquals("12345", writes.single().url.queryParameter("uid")); assertEquals("402", writes.single().url.queryParameter("activeId"))
        assertFalse(script.requests.any { "getAttendList" in it.url.encodedPath })
    }
    @Test fun changedFaceRequirementStopsBeforeAnySignOrUpload() = runBlocking {
        val script = Script { request -> if (request.url.encodedPath == "/v2/apis/active/getPPTActiveInfo") Reply("""{"result":1,"data":{"otherId":0,"openCheckFaceFlag":1}}""") else ordinaryFixture(request) }
        val api = XxtApi(MemoryXxtStorage(), script)
        val result = runCatching { api.sign(XxtUser("12345", "示例本人"), plan()) }
        assertEquals("UNSUPPORTED", (result.exceptionOrNull() as XxtFailure).kind)
        assertFalse(script.requests.any { "stuSignajax" in it.url.encodedPath || "upload" in it.url.encodedPath })
    }
    @Test fun accountMismatchStopsBeforeActivityOrSignRequest() = runBlocking {
        val script = Script(::ordinaryFixture); val api = XxtApi(MemoryXxtStorage(), script)
        val result = runCatching { api.sign(XxtUser("99999", "另一个人"), plan()) }
        assertEquals("SESSION", (result.exceptionOrNull() as XxtFailure).kind)
        assertEquals(listOf("/apis/login/userLogin4Uname.do"), script.requests.map { it.url.encodedPath })
    }
    @Test fun transportFailureDuringWriteIsUnknownWithNoReplay() = runBlocking {
        val script = Script { request -> if (request.url.encodedPath == "/pptSign/stuSignajax") Reply(fail = true) else ordinaryFixture(request) }
        val api = XxtApi(MemoryXxtStorage(), script)
        assertEquals(XxtSignResult.Unknown, api.sign(XxtUser("12345", "示例本人"), plan()))
        assertEquals(1, script.requests.count { "stuSignajax" in it.url.encodedPath })
    }
    @Test fun readOnlyGuardBlocksSignDetailAndAllWriteOrUploadRoutes() = runBlocking {
        val script = Script(::ordinaryFixture); val api = XxtApi(MemoryXxtStorage(), script, readOnly = true)
        val result = runCatching { api.sign(XxtUser("12345", "示例本人"), plan()) }
        assertTrue(result.exceptionOrNull() is IllegalArgumentException)
        assertEquals(listOf("/apis/login/userLogin4Uname.do"), script.requests.map { it.url.encodedPath })
    }
    @Test fun throttlingHonorsRetryAfterWithoutExtraRequests() = runBlocking {
        val script = Script { Reply(code = 429, headers = mapOf("Retry-After" to "60")) }; val api = XxtApi(MemoryXxtStorage(), script)
        repeat(2) { assertEquals("RATE", (runCatching { api.courses() }.exceptionOrNull() as XxtFailure).kind) }
        assertEquals(1, script.requests.size)
    }
    @Test fun htmlAndUnauthorizedRepliesAreExpiredSessionsNotEmptyCourses() = runBlocking {
        for (reply in listOf(Reply(code = 401), Reply("<html>login private details</html>"))) {
            val script = Script { reply }; val api = XxtApi(MemoryXxtStorage(), script)
            val failure = runCatching { api.courses() }.exceptionOrNull() as XxtFailure
            assertEquals("SESSION", failure.kind); assertFalse(failure.message!!.contains("private details")); assertEquals(1, script.requests.size)
        }
    }
    @Test fun loginRedirectsBecomeGetsAndCarryScopedCookiesAcrossChaoxingHosts() = runBlocking {
        val script = Script { request -> when (request.url.encodedPath) {
            "/v11/loginregister" -> Reply(code = 302, headers = mapOf("Location" to "https://sso.chaoxing.com/continue", "Set-Cookie" to "UID=fixture; Domain=chaoxing.com; Path=/; Secure"))
            "/continue" -> Reply("""{"status":true}""")
            else -> ordinaryFixture(request)
        } }
        val storage = MemoryXxtStorage().also { it.write("device", "fixture-device") }
        assertEquals("12345", XxtApi(storage, script).login("student", "password123").uid)
        assertEquals(listOf("POST", "GET", "POST"), script.requests.map { it.method })
        assertNull(script.requests[1].body); assertEquals("UID=fixture", script.requests[1].header("Cookie"))
        assertEquals("UID=fixture", script.requests[2].header("Cookie"))
        assertTrue(script.requests.all { it.header("User-Agent") == xxtUserAgent("fixture-device") && it.header("Accept-Language") == "zh_CN" })
        assertEquals("fixture", XxtCookies(storage).loadForRequest(script.requests[1].url).single().value)
    }
    @Test fun redirectsFollowAtMostThreeHopsAndNeverSendCookiesToForeignHosts() = runBlocking {
        for (target in listOf("/next", "http://passport2.chaoxing.com/next", "https://private.example/next")) {
            val script = Script { Reply(code = 302, headers = mapOf("Location" to target)) }
            val failure = runCatching { XxtApi(MemoryXxtStorage(), script).courses() }.exceptionOrNull() as XxtFailure
            assertEquals("REDIRECT", failure.kind); assertEquals(if (target == "/next") 4 else 1, script.requests.size)
        }
        val script = Script { request -> if (request.url.encodedPath == "/final") Reply("""{"result":1,"msg":{"puid":12345}}""") else Reply(code = 302, headers = mapOf("Location" to when (request.url.encodedPath) { "/apis/login/userLogin4Uname.do" -> "/one"; "/one" -> "two"; else -> "/final" })) }
        assertEquals("12345", XxtApi(MemoryXxtStorage(), script).user().uid)
        assertEquals(listOf("/apis/login/userLogin4Uname.do", "/one", "/two", "/final"), script.requests.map { it.url.encodedPath })
    }
    @Test fun smsAndPasswordRejectionsDisplayMesAndDoNotFetchProfile() = runBlocking {
        val script = Script { Reply("""{"status":false,"mes":"账号或密码错误"}""") }
        val api = XxtApi(MemoryXxtStorage(), script)
        for (action in listOf<suspend () -> Unit>({ api.login("student", "bad") }, { api.sendSms("13800000000") }, { api.loginSms("13800000000", "123456") })) {
            assertEquals("账号或密码错误", (runCatching { action() }.exceptionOrNull() as XxtFailure).message)
        }
        assertEquals(listOf("/v11/loginregister", "/api/sendcaptcha", "/v11/loginregister"), script.requests.map { it.url.encodedPath })
    }
    @Test fun smsSuccessUsesSendAndNativeLoginThenUserWhileExpiredQrIsDistinctFromWaiting() = runBlocking {
        val script = Script { request -> when (request.url.encodedPath) {
            "/api/sendcaptcha", "/v11/loginregister" -> Reply("""{"status":true}""")
            else -> ordinaryFixture(request)
        } }
        val api = XxtApi(MemoryXxtStorage(), script)
        api.sendSms("13800000000")
        assertEquals("12345", api.loginSms("13800000000", "123456").uid)
        assertEquals(3, script.requests.size)
        val qr = XxtQrLogin("fixture", "fixture", byteArrayOf())
        val expired = XxtApi(MemoryXxtStorage(), Script { Reply("""{"status":false,"type":2}""") })
        assertEquals("QR_EXPIRED", (runCatching { expired.pollQr(qr) }.exceptionOrNull() as XxtFailure).kind)
        assertNull(XxtApi(MemoryXxtStorage(), Script { Reply("""{"status":false,"type":"0"}""") }).pollQr(qr))
        assertEquals("12345", XxtApi(MemoryXxtStorage(), Script { if (it.url.encodedPath.contains("getauthstatus")) Reply("""{"status":true}""") else ordinaryFixture(it) }).pollQr(qr)!!.uid)
    }
    @Test fun invalidLoginAndMalformedResponsesAreSanitized() = runBlocking {
        val denied = XxtApi(MemoryXxtStorage(), Script { Reply("""{"status":false,"msg":"private account data"}""") })
        val failure = runCatching { denied.login("fixture", "fixture-password") }.exceptionOrNull() as XxtFailure
        assertEquals("LOGIN", failure.kind); assertFalse(failure.message!!.contains("private account data"))
        val malformed = XxtApi(MemoryXxtStorage(), Script { Reply("not-json") })
        assertEquals("FORMAT", (runCatching { malformed.courses() }.exceptionOrNull() as XxtFailure).kind)
    }
    @Test fun readExpiryReauthenticatesOnceAndOnlyRetriesRead() = runBlocking {
        var reads = 0; var logins = 0
        val result = xxtReadRecover(credentials = { "fixture" to "fixture-password" }, login = { _, _ -> logins++ }, expired = { fail("Credentials are saved") }) {
            reads++; if (reads == 1) throw XxtFailure("SESSION", "expired") else "courses"
        }
        assertEquals("courses", result); assertEquals(2, reads); assertEquals(1, logins)
    }
    @Test fun missingCredentialsAndNonSessionFailuresAreNotRetried() = runBlocking {
        var expired = false; var reads = 0
        val absent = runCatching { xxtReadRecover(credentials = { "" to "" }, login = { _, _ -> fail("No login") }, expired = { expired = true }) { reads++; throw XxtFailure("SESSION", "expired") } }
        assertTrue(expired); assertTrue(absent.exceptionOrNull() is XxtFailure); assertEquals(1, reads)
        val invalid = runCatching { xxtReadRecover(credentials = { fail("No credential read"); "" to "" }, login = { _, _ -> fail("No login") }, expired = { fail("No invalidation") }) { throw XxtFailure("FORMAT", "changed") } }
        assertEquals("FORMAT", (invalid.exceptionOrNull() as XxtFailure).kind)
    }
    @Test fun recoveryCannotLoopAndLogoutClearsPersistedMaterial() = runBlocking {
        var logins = 0; var reads = 0
        val result = runCatching { xxtReadRecover(credentials = { "fixture" to "fixture-password" }, login = { _, _ -> logins++ }, expired = {}) { reads++; throw XxtFailure("SESSION", "expired") } }
        assertTrue(result.exceptionOrNull() is XxtFailure); assertEquals(1, logins); assertEquals(2, reads)
        val storage = MemoryXxtStorage(); storage.write("account", "fixture"); storage.write("password", "fixture-password"); storage.write("journal", "pending")
        val api = XxtApi(storage, Script { error("Logout must not make requests") })
        api.clear(); assertTrue(storage.values.isEmpty())
    }
}
