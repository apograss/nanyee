package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Timeout
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class XxtClassroomApiTest {
    private val writes = setOf("/widget/quickvote/doQuestion", "/v2/apis/studentQuestion/doQuestion", "/v2/apis/studentQuestion/doQuestionAnswering", "/apis/invitation/addReply", "/v2/apis/score/stuSubmitAnswer")
    private inner class Script(var type: Int = 42) : Call.Factory {
        val requests = mutableListOf<Request>()
        var owner = "12345"
        var open = true
        var changed = false
        var failWrite = false
        var writeResponse = """{"result":1}"""
        var replyContent = "初始回复"
        override fun newCall(request: Request): Call {
            requests.add(request)
            return object : Call {
                private var cancelled = false
                override fun request() = request
                override fun execute(): Response = error("Asynchronous fixture only")
                override fun enqueue(responseCallback: Callback) {
                    val path = request.url.encodedPath
                    if (path in writes && failWrite) { responseCallback.onFailure(this, IOException("sensitive-fixture-message")); return }
                    val text = when (path) {
                        "/apis/login/userLogin4Uname.do" -> """{"result":1,"msg":{"puid":"$owner","name":"示例本人","clientId":""}}"""
                        "/pptTestPaperStu/checkActiveStatus" -> """{"status":${if (open) 1 else 0},"type":42,"source":15}"""
                        "/v2/apis/quiz/quizDetail" -> buildJsonObject {
                            put("result", 1)
                            val data = when (type) { 43 -> xxtQuestionData(0); 14 -> xxtQuestionData(0, 1, 4, 16); else -> xxtClassFixture("questions").getValue("data").jsonObject }
                            put("data", if (changed) JsonObject(data + ("pptUserAttend" to buildJsonObject { put("id", "changed") })) else data)
                        }.toString()
                        "/v2/apis/active/getPPTActiveInfo" -> xxtClassFixture("rating").toString()
                        "/v2/apis/score/getStuScoreDetail" -> """{"result":1,"data":null}"""
                        "/apis/topic/getTopic" -> xxtClassFixture("topic").toString()
                        "/apis/invitation/getReplys2" -> """{"result":1,"data":{"list":[{"creater_name":"示例同学","content":"$replyContent","ftime":"今天"}]}}"""
                        "/widget/webcache/pick/stu/pickAttend" -> xxtClassFixture("pick").toString()
                        in writes -> writeResponse
                        else -> error("Unexpected fixture endpoint: $path")
                    }
                    responseCallback.onResponse(this, Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("fixture").body(text.toResponseBody()).build())
                }
                override fun cancel() { cancelled = true }
                override fun isCanceled() = cancelled
                override fun isExecuted() = true
                override fun timeout() = Timeout.NONE
                override fun clone(): Call = newCall(request)
            }
        }
        fun writeRequests() = requests.filter { it.url.encodedPath in writes }
    }
    private suspend fun plan(api: XxtApi, type: Int): XxtClassSubmission {
        val activity = xxtClassActivity(type); val page = api.classroom(xxtClassCourse, activity, xxtClassUser)
        return XxtClassSubmission(xxtClassUser, xxtClassCourse, activity, page, xxtManualDraft(page))
    }
    @Test fun eachClassroomWriteChecksIdentityAndDetailsAndWritesExactlyOnceWithoutReceiptsOrUploads() = runBlocking {
        xxtClassroomWrites.forEach { type ->
            val script = Script(type); val api = XxtApi(MemoryXxtStorage(), script); val value = plan(api, type)
            assertTrue(script.writeRequests().isEmpty())
            assertEquals(XxtClassResult.SUCCESS, api.submitClassroom(value)); assertEquals(1, script.writeRequests().size)
            assertTrue(script.requests.any { it.url.encodedPath == "/apis/login/userLogin4Uname.do" })
            assertFalse(script.requests.any { "answerReceipt" in it.url.encodedPath || "Signajax" in it.url.encodedPath || "upload" in it.url.encodedPath || "getAttendList" in it.url.encodedPath })
        }
    }
    @Test fun changedAccountPreventsEveryClassroomWrite() = runBlocking {
        xxtClassroomWrites.forEach { type ->
            val script = Script(type); val api = XxtApi(MemoryXxtStorage(), script); val value = plan(api, type)
            script.owner = "99999"
            val error = assertThrows(XxtFailure::class.java) { runBlocking { api.submitClassroom(value) } }
            assertEquals("SESSION", error.kind); assertTrue(script.writeRequests().isEmpty()); assertFalse(error.message.orEmpty().contains("99999"))
        }
    }
    @Test fun changedSubmissionStatusOrClosedQuizPreventsWrites() = runBlocking {
        listOf(false, true).forEach { close ->
            val script = Script(); val api = XxtApi(MemoryXxtStorage(), script); val value = plan(api, 42)
            if (close) script.open = false else script.changed = true
            val error = assertThrows(XxtFailure::class.java) { runBlocking { api.submitClassroom(value) } }
            assertEquals("CHANGED", error.kind); assertTrue(script.writeRequests().isEmpty())
        }
    }
    @Test fun rejectedUnknownMalformedAndNetworkOutcomesNeverRetryWrites() = runBlocking {
        listOf("""{"result":0,"errorMsg":"sensitive-fixture-message"}""", "{}", "not-json", "network").forEach { outcome ->
            val script = Script(); val api = XxtApi(MemoryXxtStorage(), script); val value = plan(api, 42)
            if (outcome == "network") script.failWrite = true else script.writeResponse = outcome
            when (outcome) {
                "{}" -> assertEquals(XxtClassResult.UNKNOWN, api.submitClassroom(value))
                "not-json", "network" -> {
                    val error = assertThrows(XxtFailure::class.java) { runBlocking { api.submitClassroom(value) } }
                    assertFalse(error.message.orEmpty().contains("sensitive-fixture-message")); assertFalse(error.message.orEmpty().contains("not-json"))
                }
                else -> assertEquals(XxtClassResult.REJECTED, api.submitClassroom(value))
            }
            assertEquals(1, script.writeRequests().size)
        }
    }
    @Test fun discussionRepliesMayRefreshWithoutInvalidatingTheConfirmedReply() = runBlocking {
        val script = Script(5); val api = XxtApi(MemoryXxtStorage(), script); val value = plan(api, 5)
        script.replyContent = "新增回复"
        assertEquals(XxtClassResult.SUCCESS, api.submitClassroom(value)); assertEquals(1, script.writeRequests().size)
        val write = script.writeRequests().single(); assertEquals("12345", write.url.queryParameter("puid")); assertEquals(listOf(value.draft.text), write.formValues("content"))
    }
    @Test fun missingTopicMetadataAndUnknownActivitiesRemainReadOnly() = runBlocking {
        val script = Script(); val api = XxtApi(MemoryXxtStorage(), script)
        val missing = api.classroom(xxtClassCourse, xxtClassActivity(5).copy(topicId = ""), xxtClassUser)
        assertFalse(missing.writable); assertTrue(script.requests.isEmpty())
        val unknown = api.classroom(xxtClassCourse, xxtClassActivity(999), xxtClassUser)
        assertFalse(unknown.writable); assertTrue(unknown.notice.isNotBlank()); assertTrue(script.writeRequests().isEmpty())
        assertEquals(listOf("/v2/apis/active/getPPTActiveInfo"), script.requests.map { it.url.encodedPath })
    }
    @Test fun pickedPollingEndpointIsReadOnlyAndReturnsOnlyOwnStatus() = runBlocking {
        val script = Script(); val api = XxtApi(MemoryXxtStorage(), script)
        assertEquals(XxtPickStatus(1, true), api.picked(xxtClassActivity(11), "12345"))
        assertEquals("GET", script.requests.single().method); assertTrue(script.writeRequests().isEmpty())
        assertThrows(IllegalArgumentException::class.java) { runBlocking { api.picked(xxtClassActivity(43), "12345") } }
        assertEquals(1, script.requests.size)
    }
    @Test fun liveListingGuardStillBlocksAllClassroomReadsAndWritesBeforeTransport() = runBlocking {
        val script = Script(); val api = XxtApi(MemoryXxtStorage(), script, readOnly = true)
        xxtClassroomWrites.forEach { type ->
            val demo = XxtClassroomDemo(); val activity = demo.activities().first { it.type == type }; val page = demo.page(activity)
            val value = XxtClassSubmission(xxtClassUser, xxtClassCourse, activity, page, xxtManualDraft(page))
            assertThrows(IllegalArgumentException::class.java) { runBlocking { api.submitClassroom(value) } }
        }
        assertTrue(script.writeRequests().isEmpty()); assertTrue(script.requests.all { it.url.encodedPath == "/apis/login/userLogin4Uname.do" })
    }
    @Test fun activityParserCarriesOnlyTopicIdFromDiscussionMetadata() {
        val app = Json.parseToJsonElement("""{"activeList":[{"id":"401","nameOne":"讨论","activeType":5,"status":1,"extraInfo":{"topicId":123,"other":"secret"}}]}""").jsonObject
        val web = Json.parseToJsonElement("""{"data":{"activeList":[]}}""").jsonObject
        val row = xxtActivities(app, web).single(); assertEquals("123", row.topicId)
        assertEquals("讨论", row.name)
    }
}
