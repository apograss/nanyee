package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class CabinRecoveryTest {
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
        override suspend fun clearLocal() {}
        override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
            calls += "$method $path"
            if (failCreate && method == "POST") error("unknown response")
            return payload("id" to "new")
        }
    }

    @Test fun replacementCreatesBeforeRevoking() = runBlocking {
        val backend = Backend()
        assertEquals("new", createCabinCredential(backend, cabinSecret("fixture-new", "fixture-only", true), "old").text("id"))
        assertEquals(listOf("POST /credentials", "DELETE /credentials/old"), backend.calls)
    }

    @Test fun failedCreateDoesNotRevokeOldCredential() = runBlocking {
        val backend = Backend().apply { failCreate = true }
        try { createCabinCredential(backend, JsonObject(emptyMap()), "old"); fail() } catch (_: IllegalStateException) {}
        assertEquals(listOf("POST /credentials"), backend.calls)
    }
}
