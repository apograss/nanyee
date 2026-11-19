package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import okio.ByteString
import okio.Timeout
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class RainApiTest {
    private data class Reply(val text: String = "{}", val code: Int = 200, val headers: Map<String, String> = emptyMap(), val fail: Boolean = false)
    private class Script(val reply: (Request) -> Reply) : Call.Factory {
        val requests = mutableListOf<Request>()
        override fun newCall(request: Request): Call {
            requests.add(request)
            return object : Call {
                private var cancelled = false
                override fun request() = request
                override fun execute(): Response = error("Only asynchronous calls")
                override fun enqueue(responseCallback: Callback) {
                    val value = reply(request)
                    if (value.fail) responseCallback.onFailure(this, IOException("PRIVATE-UPSTREAM-TEXT"))
                    else responseCallback.onResponse(this, Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(value.code).message("fixture").apply { value.headers.forEach { (key, data) -> addHeader(key, data) } }.body(value.text.toResponseBody()).build())
                }
                override fun cancel() { cancelled = true }
                override fun isCanceled() = cancelled
                override fun isExecuted() = true
                override fun timeout() = Timeout.NONE
                override fun clone(): Call = newCall(request)
            }
        }
    }
    private fun body(request: Request): JsonObject { val buffer = Buffer(); requireNotNull(request.body).writeTo(buffer); return Json.parseToJsonElement(buffer.readUtf8()).jsonObject }
    private fun fixture(request: Request): Reply = when (request.url.encodedPath) {
        "/v/course_meta/user_info" -> Reply(rainFixture("profile").toString())
        "/v/course_meta/learning_list/" -> Reply(rainFixture("courses").toString())
        "/api/v3/classroom/on-lesson" -> Reply(rainFixture("onLesson").toString())
        "/api/v3/user/login/pre-info" -> Reply(rainFixture("qr").toString())
        "/api/v3/user/login" -> Reply("""{"code":0,"data":{}}""")
        "/api/v3/app/scan" -> Reply("""{"code":0,"data":{"value":"33"}}""")
        "/api/v3/lesson/checkin" -> Reply(rainFixture("checkin").toString(), headers = mapOf("set-auth" to "fixture-bearer"))
        "/api/v3/lesson/location-checkin/eligibility" -> Reply(rainFixture("eligibility").toString())
        "/api/v3/lesson/presentation/fetch" -> Reply(buildJsonObject { put("code", 0); put("data", rainFixture("presentation")) }.toString())
        "/api/v3/lesson/location-checkin/submit", "/api/v3/lesson/problem/answer", "/api/v3/lesson/problem/retry" -> Reply("""{"code":0}""")
        else -> error("Unexpected fixture route")
    }
    private fun api(script: Script, host: RainHost = RainHost.WWW, assets: Call.Factory? = null): RainApi = RainApi(MemoryRainStore().also { it.write("owner.${host.name}", "1001"); it.write("cookies.${host.name}", "csrftoken=fixture-csrf; path=/; secure\nsessionid=fixture-session; path=/; secure") }, host, script, assets, clock = { 100000 })
    @Test fun onlyReadCallsListCoursesAndActiveLessons() = runBlocking {
        val script = Script(::fixture); val api = api(script)
        assertEquals("1001", api.user().id); assertEquals(1, api.courses().size); assertEquals(1, api.onLesson().size)
        assertTrue(script.requests.all { it.method == "GET" }); assertFalse(script.requests.any { "checkin" in it.url.encodedPath || "/scan" in it.url.encodedPath })
    }
    @Test fun qrUsesOnlyPreInfoAndTokenPollNeverOAuthOrPasswordEndpoints() = runBlocking {
        val script = Script(::fixture); val api = api(script)
        val qr = api.qr(); assertTrue(api.poll(qr)); assertEquals("1001", api.user().id)
        assertEquals(listOf("/api/v3/user/login/pre-info", "/api/v3/user/login", "/v/course_meta/user_info"), script.requests.map { it.url.encodedPath })
        assertEquals("fixture-qr-token", body(script.requests[1]).text("token")); assertNull(script.requests[0].header("x-uid"))
        assertTrue(script.requests.all { it.url.host == RainHost.WWW.domain })
    }
    @Test fun expiredQrDoesNotLoopOrFetchUserInfo() = runBlocking {
        val script = Script { if (it.url.encodedPath == "/api/v3/user/login") Reply("""{"code":50001,"message":"PRIVATE-UPSTREAM-TEXT"}""") else fixture(it) }; val api = api(script)
        assertFalse(api.poll(api.qr())); assertEquals(2, script.requests.size)
    }
    @Test fun checkinHasItsOwnExplicitPostAndTokenResponse() = runBlocking {
        val script = Script(::fixture); val api = api(script, RainHost.PRO)
        assertEquals(rainTestLesson(RainHost.PRO), api.join(RainUser("1001", "示例同学"), "33"))
        val write = script.requests.last(); assertEquals("POST", write.method); assertEquals("/api/v3/lesson/checkin", write.url.encodedPath)
        assertEquals(21, body(write).number("source")); assertTrue(body(write)["joinIfNotIn"]!!.jsonPrimitive.boolean); assertEquals("33", body(write).text("lessonId"))
        assertEquals("fixture-csrf", write.header("x-csrftoken")); assertEquals("fixture-session", write.header("sessionid")); assertEquals("1001", write.header("x-uid")); assertEquals(RainHost.PRO.domain, write.url.host)
    }
    @Test fun scanDoesNotAutomaticallyCallCheckin() = runBlocking {
        val script = Script(::fixture); val api = api(script)
        assertEquals("33", api.scan(RainUser("1001", "示例同学"), "https://www.yuketang.cn/fixture/lesson?q=fixture"))
        assertEquals(listOf("/v/course_meta/user_info", "/api/v3/app/scan"), script.requests.map { it.url.encodedPath }); assertEquals("https://www.yuketang.cn/fixture/lesson?q=fixture", body(script.requests.last()).text("url"))
    }
    @Test fun mismatchedAccountsStopEveryWriteBeforeItsPost() = runBlocking<Unit> {
        val operations: List<suspend (RainApi) -> Unit> = listOf({ it.scan(RainUser("2002", "other"), "https://www.yuketang.cn/fixture/lesson") }, { it.join(RainUser("2002", "other"), "33") }, { it.answer(rainTestAnswer().copy(lesson = rainTestLesson().copy(uid = "2002"))) }, { it.locate(RainAction.Location(rainTestLesson().copy(uid = "2002"), XxtPosition(20.5, 110.5, 99999, 10f), RainEligibility(true, false, "活动地址说明"))) })
        operations.forEach { operation -> val script = Script(::fixture); val value = runCatching { operation(api(script)) }.exceptionOrNull() as RainFailure; assertEquals("SESSION", value.kind); assertTrue(script.requests.all { it.method == "GET" }); assertEquals(1, script.requests.size) }
    }
    @Test fun crossHostClassroomTokensAreNeverSent() = runBlocking {
        val script = Script(::fixture)
        assertTrue(runCatching { api(script, RainHost.PRO).answer(rainTestAnswer()) }.isFailure)
        assertTrue(script.requests.isEmpty())
    }
    @Test fun realPositionIsSentUnmodifiedWithBearerAndRecheckedEligibility() = runBlocking {
        val script = Script(::fixture); val api = api(script)
        val action = RainAction.Location(rainTestLesson(), XxtPosition(20.5, 110.5, 99999, 15f), RainEligibility(true, false, "活动地址说明"))
        assertEquals(RainResult.SUCCESS, api.locate(action))
        val write = script.requests.last(); assertEquals("Bearer fixture-bearer", write.header("Authorization")); assertEquals("20.5", body(write).text("lat")); assertEquals("110.5", body(write).text("lng")); assertEquals(54, body(write).number("source"))
        assertEquals(listOf("/v/course_meta/user_info", "/api/v3/lesson/location-checkin/eligibility", "/api/v3/lesson/location-checkin/submit"), script.requests.map { it.url.encodedPath })
    }
    @Test fun changedLocationStatusStopsThePost() = runBlocking {
        val script = Script(::fixture)
        val action = RainAction.Location(rainTestLesson(), XxtPosition(20.5, 110.5, 99999, 15f), RainEligibility(true, false, "changed"))
        assertEquals("CHANGED", (runCatching { api(script).locate(action) }.exceptionOrNull() as RainFailure).kind); assertTrue(script.requests.all { it.method == "GET" })
    }
    @Test fun normalAndRetryAreSeparateSingleWritesWithManualBodies() = runBlocking {
        for (retry in listOf(false, true)) {
            val script = Script(::fixture); assertEquals(RainResult.SUCCESS, api(script).answer(rainTestAnswer(retry = retry)))
            val write = script.requests.last(); assertEquals(if (retry) "/api/v3/lesson/problem/retry" else "/api/v3/lesson/problem/answer", write.url.encodedPath); assertEquals("Bearer fixture-bearer", write.header("Authorization")); assertEquals(rainAnswerBody(rainTestAnswer(retry = retry), 100000), body(write)); assertEquals(1, script.requests.count { it.method == "POST" })
        }
    }
    @Test fun networkErrorsAndInvalidWriteResponsesAreUnknownAndNotRetried() = runBlocking {
        for (reply in listOf(Reply(fail = true), Reply("private html", code = 500), Reply("not json PRIVATE-UPSTREAM-TEXT"))) {
            val script = Script { if (it.method == "POST") reply else fixture(it) }
            val error = runCatching { api(script).answer(rainTestAnswer()) }.exceptionOrNull() as RainFailure
            assertEquals("UNKNOWN", error.kind); assertFalse(error.message!!.contains("PRIVATE-UPSTREAM-TEXT")); assertEquals(1, script.requests.count { it.method == "POST" })
        }
    }
    @Test fun explicitRejectionAndMissingStatusAreNotSuccess() = runBlocking {
        for ((text, expected) in listOf("""{"code":1,"message":"PRIVATE-UPSTREAM-TEXT"}""" to RainResult.REJECTED, "{}" to RainResult.UNKNOWN)) {
            val script = Script { if (it.method == "POST") Reply(text) else fixture(it) }
            assertEquals(expected, api(script).answer(rainTestAnswer())); assertEquals(1, script.requests.count { it.method == "POST" })
        }
    }
    @Test fun successfulCheckinWithMissingCredentialsIsUnknownNotSafeToRetry() = runBlocking {
        val script = Script { if (it.url.encodedPath == "/api/v3/lesson/checkin") Reply("""{"code":0,"data":{}}""") else fixture(it) }
        assertEquals("UNKNOWN", (runCatching { api(script).join(RainUser("1001", "示例同学"), "33") }.exceptionOrNull() as RainFailure).kind); assertEquals(1, script.requests.count { it.method == "POST" })
    }
    @Test fun redirectsHtmlAndUnauthorizedReadsRequireNewLoginWithoutLeakingData() = runBlocking {
        for (reply in listOf(Reply(code = 302, headers = mapOf("Location" to "https://private.example/account")), Reply("<html>PRIVATE-UPSTREAM-TEXT</html>"), Reply(code = 401))) {
            val script = Script { reply }; val error = runCatching { api(script).courses() }.exceptionOrNull() as RainFailure
            assertEquals("SESSION", error.kind); assertFalse(error.message!!.contains("PRIVATE-UPSTREAM-TEXT")); assertFalse(error.message!!.contains("private.example")); assertEquals(1, script.requests.size)
        }
    }
    @Test fun rateLimitStopsFurtherCallsUntilRetryAfter() = runBlocking {
        val script = Script { Reply(code = 429, headers = mapOf("Retry-After" to "60")) }; val api = api(script)
        repeat(2) { assertEquals("RATE", (runCatching { api.courses() }.exceptionOrNull() as RainFailure).kind) }; assertEquals(1, script.requests.size)
    }
    @Test fun slidesUseEncodedPresentationIdAndBearerOnlyOnApiHost() = runBlocking {
        val script = Script(::fixture); val api = api(script)
        assertEquals(2, api.presentation(rainTestLesson(), "deck?x=private").slides.size)
        assertEquals("deck?x=private", script.requests.single().url.queryParameter("presentation_id")); assertEquals("Bearer fixture-bearer", script.requests.single().header("Authorization"))
    }
    @Test fun imagesUseAnonymousSeparateClientAndNeverFollowUntrustedSchemes() = runBlocking {
        val script = Script(::fixture); val images = Script { Reply("pixels", headers = mapOf("Content-Type" to "image/png")) }; val api = api(script, assets = images)
        assertEquals("pixels", api.image("https://images.example/slide.png").toString(Charsets.UTF_8))
        assertTrue(script.requests.isEmpty()); assertTrue(images.requests.single().headers.names().none { it.lowercase() in setOf("authorization", "cookie", "x-uid", "sessionid", "x-csrftoken") })
        assertTrue(runCatching { api.image("http://127.0.0.1/private") }.isFailure); assertEquals(1, images.requests.size)
    }
    @Test fun imageRedirectsAndNonImagesFailWithoutFollowing() = runBlocking {
        for (reply in listOf(Reply(code = 302, headers = mapOf("Location" to "https://private.example")), Reply("html", headers = mapOf("Content-Type" to "text/html")), Reply(fail = true))) {
            val script = Script { reply }; assertTrue(runCatching { api(Script(::fixture), assets = script).image("https://images.example/x.png") }.isFailure); assertEquals(1, script.requests.size)
        }
    }
    @Test fun webSocketUsesSelectedHostAndSendsLeaveExactlyOnceOnClose() {
        val sent = mutableListOf<String>(); var closed = 0; var request: Request? = null; var listener: WebSocketListener? = null
        val sockets = object : WebSocket.Factory {
            override fun newWebSocket(r: Request, l: WebSocketListener): WebSocket {
                request = r; listener = l
                val socket = object : WebSocket {
                    override fun request() = r
                    override fun queueSize() = 0L
                    override fun send(text: String): Boolean { sent.add(text); return true }
                    override fun send(bytes: ByteString) = false
                    override fun close(code: Int, reason: String?): Boolean { closed++; return true }
                    override fun cancel() = Unit
                }
                l.onOpen(socket, Response.Builder().request(r).protocol(Protocol.HTTP_1_1).code(101).message("fixture").build()); return socket
            }
        }
        val store = MemoryRainStore().also { it.write("owner.PRO", "1001") }
        val api = RainApi(store, RainHost.PRO, Script(::fixture), sockets = sockets)
        val frames = mutableListOf<RainFrame>(); val live = api.connect(rainTestLesson(RainHost.PRO), frames::add, {})
        assertEquals("https://pro.yuketang.cn/wsapp/", request!!.url.toString()); assertEquals("hello", Json.parseToJsonElement(sent.single()).jsonObject.text("op"))
        assertNotNull(listener); live.close(); live.close(); assertEquals(2, sent.size); assertEquals("leavelesson", Json.parseToJsonElement(sent.last()).jsonObject.text("op")); assertEquals(1, closed)
    }
}
