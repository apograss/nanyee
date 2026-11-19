package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class CabinRecoveryTest {
    @Test fun confirmationExpiresWhileDialogIsOpen() {
        val draft = CabinDraft("2030-01-02", cabins = listOf(1), scheduled = "2030-01-01T10:00:00+08:00", until = "2030-01-02T08:50:00+08:00")
        val submission = CabinSubmission(cabinJob(draft, "fixture"))
        assertNull(submission.validation(setOf(1), Instant.parse("2030-01-01T02:00:00Z")))
        assertNotNull(submission.validation(setOf(1), Instant.parse("2030-01-02T00:50:00Z")))
        assertNotNull(submission.validation(emptySet(), Instant.parse("2030-01-01T02:00:00Z")))
    }
    @Test fun lostCredentialResponseIsAdoptedWithoutSecondPost() = runBlocking {
        var posts = 0
        var stored = emptyList<JsonObject>()
        val backend = object : PlatformBackend {
            override suspend fun clearLocal() {}
            override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
                if (method == "GET") return JsonArray(stored)
                posts++
                stored = listOf(payload("id" to "new", "upstream" to "infospace", "purpose" to "study_cabin", "status" to "active"))
                error("lost response")
            }
        }
        val recovery = CabinCredentialRecovery()
        try { recovery.save(backend, JsonObject(emptyMap())); fail() } catch (_: IllegalStateException) {}
        assertEquals("new", recovery.save(backend, JsonObject(emptyMap())).text("id"))
        assertEquals(1, posts)
    }
    @Test fun pendingSubmissionMatchesPayloadNotState() = runBlocking {
        val body = cabinJob(cabinDefaults().copy(cabins = listOf(1)), "fixture")
        val sent = Instant.parse("2030-01-01T00:00:00Z")
        val pending = CabinSubmission(body, now = { sent })
        pending.send(Backend())
        val job = JsonObject(body + mapOf("state" to JsonPrimitive("running"), "created_at" to JsonPrimitive(sent.toString())))
        assertEquals(job, pending.matchingJob(listOf(job)))
        val normalizedPayload = JsonObject(body["payload"]!!.jsonObject + mapOf("start_time" to JsonPrimitive("09:00:00"), "end_time" to JsonPrimitive("11:00:00")))
        val normalizedJob = JsonObject(job + ("payload" to normalizedPayload))
        assertEquals(normalizedJob, pending.matchingJob(listOf(normalizedJob)))
        assertNull(pending.matchingJob(emptyList()))
        assertNull(pending.matchingJob(listOf(JsonObject(job + ("payload" to JsonObject(emptyMap()))))))
    }

    @Test fun reconciliationRejectsOlderCancelledBookingsAndKeepsFirstSendTime() = runBlocking {
        val sent = Instant.parse("2030-01-01T00:00:00Z")
        var clock = sent
        val body = cabinJob(cabinDefaults().copy(cabins = listOf(1)), "fixture")
        val pending = CabinSubmission(body, now = { clock })
        fun job(created: Instant, state: String, updated: Instant = created) = JsonObject(body + mapOf(
            "state" to JsonPrimitive(state), "created_at" to JsonPrimitive(created.toString()), "updated_at" to JsonPrimitive(updated.toString())))
        val recent = job(sent, "queued")
        assertNull(pending.matchingJob(listOf(recent)))
        pending.send(Backend())
        assertNull(pending.matchingJob(listOf(job(sent.minusSeconds(3600), "cancelled"))))
        assertNull(pending.matchingJob(listOf(job(sent.minusSeconds(60), "cancelled", sent.minusSeconds(30)))))
        assertNull(pending.matchingJob(listOf(job(sent.minusSeconds(121), "queued"))))
        assertEquals(recent, pending.matchingJob(listOf(recent)))
        val skewed = job(sent.minusSeconds(120), "queued")
        assertEquals(skewed, pending.matchingJob(listOf(skewed)))
        val completed = job(sent, "succeeded", sent.plusSeconds(1))
        assertEquals(completed, pending.matchingJob(listOf(completed)))
        assertNull(pending.matchingJob(listOf(JsonObject(body + ("state" to JsonPrimitive("queued"))))))
        clock = sent.plusSeconds(600)
        pending.send(Backend())
        assertEquals(recent, pending.matchingJob(listOf(recent)))
    }
    private class Backend : PlatformBackend {
        val calls = mutableListOf<String>()
        var failCreate = false
        var failList = false
        override suspend fun clearLocal() {}
        override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
            calls += "$method $path"
            if (failList && method == "GET") error("offline")
            if (method == "GET") return JsonArray(emptyList())
            if (failCreate && method == "POST") error("unknown response")
            return payload("id" to "new")
        }
    }

    @Test fun createNeverRevokesAnyCredential() = runBlocking {
        val backend = Backend()
        assertEquals("new", CabinCredentialRecovery().save(backend, cabinSecret("fixture-new", "fixture-only", true)).text("id"))
        assertEquals(listOf("GET /credentials", "POST /credentials"), backend.calls)
    }

    @Test fun failedCreateDoesNotRevokeOldCredential() = runBlocking {
        val backend = Backend().apply { failCreate = true }
        try { CabinCredentialRecovery().save(backend, JsonObject(emptyMap())); fail() } catch (_: IllegalStateException) {}
        assertEquals(listOf("GET /credentials", "POST /credentials"), backend.calls)
    }

    @Test fun failedListPreventsCredentialResubmission() = runBlocking {
        val backend = Backend().apply { failList = true }
        try { CabinCredentialRecovery().save(backend, JsonObject(emptyMap())); fail() } catch (_: IllegalStateException) {}
        assertEquals(listOf("GET /credentials"), backend.calls)
    }

    @Test fun passwordUpdatePreservesTheHostedAccountAndMetadata() = runBlocking {
        val calls = mutableListOf<String>()
        val backend = object : PlatformBackend {
            override suspend fun clearLocal() {}
            override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
                calls += "$method $path"
                if (path.endsWith("/reveal")) return payload("secret" to payload("account" to "original-fixture", "password" to "old-fixture").toString())
                assertEquals(setOf("secret"), body!!.keys)
                val secret = Json.parseToJsonElement(body.text("secret")).jsonObject
                assertEquals("original-fixture", secret.text("account"))
                assertEquals("new-fixture", secret.text("password"))
                return JsonNull
            }
        }
        updateCabinPassword(backend, "existing", "new-fixture")
        assertEquals(listOf("POST /credentials/existing/reveal", "PUT /credentials/existing/secret"), calls)
    }
}
