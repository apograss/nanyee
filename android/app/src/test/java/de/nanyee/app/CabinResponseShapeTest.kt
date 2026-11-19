package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.util.UUID

private object CabinResponseFixtures {
    val auth = Json.parseToJsonElement("""{
        "user":{"id":"00000000-0000-4000-8000-000000000001","username":"fixture-user","nickname":"示例同学","email":null,"email_verified":false,"role":"student","status":"active","registration_trust_level":"community_quiz"},
        "csrf_header":"X-CSRF-Token"
    }""").jsonObject
    val credential = Json.parseToJsonElement("""{
        "id":"00000000-0000-4000-8000-000000000002","upstream":"infospace","purpose":"study_cabin","status":"active",
        "expires_at":null,"created_at":"2026-07-21T10:00:00Z","last_used_at":null,
        "metadata":{"account_hint":"尾号 0000"},"consent_version":"credential-hosting-v1"
    }""").jsonObject
    val credentials = JsonArray(listOf(credential))
    val cabins = Json.parseToJsonElement("""[{"dev_id":101,"name":"示例学习舱 A"},{"dev_id":102,"name":"示例学习舱 B"}]""")
    val job = Json.parseToJsonElement("""{
        "id":"00000000-0000-4000-8000-000000000003","tool_id":"study_cabin","operation":"reserve","state":"succeeded",
        "payload":{"target_date":"2026-07-22","start_time":"09:00:00","end_time":"11:00:00","title":"学习","cabin_ids":[101,102],"attempt_until":"2026-07-22T08:50:00+08:00"},
        "credential_id":"00000000-0000-4000-8000-000000000002","scheduled_for":"2026-07-21T23:59:00+08:00",
        "attempt_count":1,"max_attempts":1440,"cancel_requested_at":null,
        "receipt":{"dev_id":101,"room_name":"示例学习舱 A","target_date":"2026-07-22","start_time":"09:00","end_time":"11:00"},
        "error_code":null,"next_action":null,"created_at":"2026-07-21T10:00:00Z","updated_at":"2026-07-21T10:01:00Z"
    }""").jsonObject
    val jobs = JsonArray(listOf(job))
}

class CabinResponseShapeTest {
    @Test fun authEnvelopeContainsUserAndCsrfHeaderNameNotToken() {
        val response = CabinResponseFixtures.auth
        val user = platformUser(response)
        assertEquals("fixture-user", user.text("username"))
        assertEquals(JsonNull, user["email"])
        assertFalse(user["email_verified"]!!.jsonPrimitive.boolean)
        val request = platformRequest("POST", "/jobs", payload(), "fixture-csrf-cookie")
        assertEquals("fixture-csrf-cookie", request.header(response.text("csrf_header")))
        assertNotEquals(response.text("csrf_header"), request.header(platformCsrfHeader))
        assertEquals(user, platformUser(JsonObject(response - "csrf_header")))
        assertTrue(runCatching { platformUser(JsonObject(response + ("csrf_header" to JsonPrimitive("unexpected-header")))) }.isFailure)
        listOf(JsonNull, JsonArray(emptyList()), payload(), buildJsonObject { putJsonArray("user") {} }, buildJsonObject { putJsonObject("user") {} }).forEach {
            assertTrue(runCatching { platformUser(it) }.isFailure)
        }
    }

    @Test fun credentialListsAndCreateObjectUseStatusAndNullableDates() {
        val active = cabinCredentials(CabinResponseFixtures.credentials)
        assertEquals(listOf(CabinResponseFixtures.credential), active)
        val created = Json.parseToJsonElement(CabinResponseFixtures.credential.toString()).obj()
        assertEquals(active.first(), created)
        assertEquals(JsonNull, created["expires_at"]); assertEquals(JsonNull, created["last_used_at"])
        assertEquals("尾号 0000", created["metadata"]!!.obj().text("account_hint"))
        val revoked = JsonObject(created + ("status" to JsonPrimitive("revoked")))
        val otherPurpose = JsonObject(created + ("purpose" to JsonPrimitive("evaluation")))
        assertEquals(active, cabinCredentials(JsonArray(listOf(revoked, otherPurpose, created))))
        assertTrue(cabinCredentials(JsonArray(emptyList())).isEmpty())
    }

    @Test fun cabinAndJobListsPreserveIntegerIdsStateAndRoomName() {
        val cabins = CabinResponseFixtures.cabins.objectList()
        assertEquals(listOf(101, 102), cabins.map { it.number("dev_id") })
        assertFalse(cabins.first()["dev_id"]!!.jsonPrimitive.isString)
        val jobs = cabinJobs(CabinResponseFixtures.jobs)
        val job = jobs.single()
        assertEquals("预约成功", cabinStatus(job.text("state")))
        assertFalse(job.containsKey("status"))
        val receipt = job["receipt"]!!.obj()
        assertEquals("示例学习舱 A", receipt.text("room_name"))
        assertEquals(101, receipt.number("dev_id"))
        assertFalse(receipt.containsKey("name"))
        assertEquals(listOf(101, 102), job["payload"]!!.obj()["cabin_ids"]!!.jsonArray.map { it.jsonPrimitive.int })
        val otherTool = JsonObject(job + ("tool_id" to JsonPrimitive("evaluation")))
        assertEquals(jobs, cabinJobs(JsonArray(listOf(otherTool, job))))
        assertTrue(cabinJobs(JsonArray(emptyList())).isEmpty())
        val withoutReceipt = JsonObject(job + mapOf("receipt" to JsonNull, "state" to JsonPrimitive("queued")))
        assertEquals(JsonNull, cabinJobs(JsonArray(listOf(withoutReceipt))).single()["receipt"])
    }

    @Test fun wrappedOrMalformedListsFailRatherThanSilentlyLosingItems() {
        listOf("credentials", "cabins", "jobs").forEach { key ->
            assertTrue(runCatching { buildJsonObject { putJsonArray(key) {} }.objectList() }.isFailure)
        }
        listOf(JsonNull, JsonPrimitive("not-a-list"), JsonArray(listOf(JsonNull)), JsonArray(listOf(JsonPrimitive(1)))).forEach {
            assertTrue(runCatching { it.objectList() }.isFailure)
        }
    }

    private fun sameShape(expected: JsonElement, actual: JsonElement) {
        when (expected) {
            JsonNull -> assertEquals(JsonNull, actual)
            is JsonObject -> {
                assertTrue(actual is JsonObject)
                assertEquals(expected.keys, actual.jsonObject.keys)
                expected.forEach { (key, value) -> sameShape(value, actual.jsonObject[key]!!) }
            }
            is JsonArray -> {
                assertTrue(actual is JsonArray)
                assertTrue(actual.jsonArray.isNotEmpty())
                actual.jsonArray.forEach { sameShape(expected.first(), it) }
            }
            is JsonPrimitive -> {
                assertTrue(actual is JsonPrimitive)
                assertEquals(expected.isString, actual.jsonPrimitive.isString)
                if (!expected.isString && expected.booleanOrNull != null) assertNotNull(actual.jsonPrimitive.booleanOrNull)
                if (!expected.isString && expected.intOrNull != null) assertNotNull(actual.jsonPrimitive.intOrNull)
            }
        }
    }

    @Test fun demoResponsesMatchCapturedShapesWithoutEchoingCreateRequestFields() = runBlocking {
        val api = DemoCabinBackend()
        val login = api.call("POST", "/auth/login", payload("username" to "demo", "password" to "fixture-only"))
        sameShape(CabinResponseFixtures.auth, login)
        sameShape(CabinResponseFixtures.auth, api.call("GET", "/auth/me"))
        val credential = api.call("POST", "/credentials", cabinSecret("fixture-account-0000", "fixture-only", true)).obj()
        sameShape(CabinResponseFixtures.credential, credential)
        sameShape(CabinResponseFixtures.credentials, api.call("GET", "/credentials"))
        UUID.fromString(credential.text("id")); Instant.parse(credential.text("created_at"))
        val available = api.call("GET", "/study-cabin/cabins")
        sameShape(CabinResponseFixtures.cabins, available)
        val selected = available.objectList().reversed().take(2)
        val draft = cabinDefaults().copy(cabins = selected.map { it.number("dev_id") })
        val job = CabinSubmission(cabinJob(draft, credential.text("id"))).send(api).obj()
        assertEquals(CabinResponseFixtures.job.keys, job.keys)
        assertFalse(job.containsKey("confirmation_version")); assertFalse(job.containsKey("status"))
        assertEquals("queued", job.text("state")); assertEquals(JsonNull, job["receipt"])
        UUID.fromString(job.text("id")); Instant.parse(job.text("created_at")); Instant.parse(job.text("updated_at"))
        api.advance(job.text("id"), "succeeded")
        val jobs = api.call("GET", "/jobs")
        sameShape(CabinResponseFixtures.jobs, jobs)
        val receipt = jobs.objectList().single()["receipt"]!!.obj()
        assertEquals(selected.first().number("dev_id"), receipt.number("dev_id"))
        assertEquals(selected.first().text("name"), receipt.text("room_name"))
        val updated = api.call("PUT", "/credentials/${credential.text("id")}/secret", payload("secret" to "fixture-only")).obj()
        assertEquals(credential["metadata"], updated["metadata"])
        assertEquals(JsonNull, updated["resumed_job_id"])
        val cancelled = api.call("POST", "/jobs/${job.text("id")}/cancel").obj()
        assertEquals("cancelled", cancelled.text("state")); assertNotNull(Instant.parse(cancelled.text("cancel_requested_at")))
    }
}
