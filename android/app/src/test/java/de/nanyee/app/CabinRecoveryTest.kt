package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class CabinRecoveryTest {
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
        try { recovery.save(backend, JsonObject(emptyMap()), null); fail() } catch (_: IllegalStateException) {}
        assertEquals("new", recovery.save(backend, JsonObject(emptyMap()), null).text("id"))
        assertEquals(1, posts)
    }
    @Test fun pendingSubmissionMatchesPayloadNotState() {
        val body = cabinJob(cabinDefaults().copy(cabins = listOf(1)), "fixture")
        val pending = CabinSubmission(body)
        val job = JsonObject(body + ("state" to JsonPrimitive("running")))
        assertEquals(job, pending.matchingJob(listOf(job)))
        val normalizedPayload = JsonObject(body["payload"]!!.jsonObject + mapOf("start_time" to JsonPrimitive("09:00:00"), "end_time" to JsonPrimitive("11:00:00")))
        val normalizedJob = JsonObject(job + ("payload" to normalizedPayload))
        assertEquals(normalizedJob, pending.matchingJob(listOf(normalizedJob)))
        assertNull(pending.matchingJob(emptyList()))
        assertNull(pending.matchingJob(listOf(JsonObject(job + ("payload" to JsonObject(emptyMap()))))))
    }
    private class Backend : PlatformBackend {
        val calls = mutableListOf<String>()
        var failCreate = false
        var failList = false
        var failRevoke = false
        override suspend fun clearLocal() {}
        override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
            calls += "$method $path"
            if (failList && method == "GET") error("offline")
            if (method == "GET") return JsonArray(emptyList())
            if (failCreate && method == "POST") error("unknown response")
            if (failRevoke && method == "DELETE") error("offline")
            return payload("id" to "new")
        }
    }

    @Test fun replacementCreatesBeforeRevoking() = runBlocking {
        val backend = Backend()
        assertEquals("new", CabinCredentialRecovery().save(backend, cabinSecret("fixture-new", "fixture-only", true), "old").text("id"))
        assertEquals(listOf("GET /credentials", "POST /credentials", "DELETE /credentials/old"), backend.calls)
    }

    @Test fun failedCreateDoesNotRevokeOldCredential() = runBlocking {
        val backend = Backend().apply { failCreate = true }
        try { CabinCredentialRecovery().save(backend, JsonObject(emptyMap()), "old"); fail() } catch (_: IllegalStateException) {}
        assertEquals(listOf("GET /credentials", "POST /credentials"), backend.calls)
    }

    @Test fun failedListPreventsCredentialResubmission() = runBlocking {
        val backend = Backend().apply { failList = true }
        try { CabinCredentialRecovery().save(backend, JsonObject(emptyMap()), null); fail() } catch (_: IllegalStateException) {}
        assertEquals(listOf("GET /credentials"), backend.calls)
    }

    @Test fun failedRevocationRetriesWithoutCreatingAgain() = runBlocking {
        val backend = Backend().apply { failRevoke = true }
        val recovery = CabinCredentialRecovery()
        try { recovery.save(backend, JsonObject(emptyMap()), "old"); fail() } catch (_: IllegalStateException) {}
        backend.failRevoke = false
        recovery.save(backend, JsonObject(emptyMap()), "old")
        assertEquals(1, backend.calls.count { it == "POST /credentials" })
        assertEquals(2, backend.calls.count { it == "DELETE /credentials/old" })
    }
}
