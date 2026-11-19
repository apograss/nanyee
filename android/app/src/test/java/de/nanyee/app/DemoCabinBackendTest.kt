package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class DemoCabinBackendTest {
    @Test fun revocationCancelsOnlyQueuedAndRetryingJobsForThatCredential() = runBlocking {
        val api = DemoCabinBackend(); login(api)
        val id = api.call("POST", "/credentials", cabinSecret("demo0000", "fixture-only", true)).obj().text("id")
        val other = api.call("POST", "/credentials", cabinSecret("other", "fixture-only", true)).obj().text("id")
        val draft = cabinDefaults().copy(cabins = listOf(1))
        val states = listOf("queued", "retry_wait", "running", "succeeded", "failed", "cancelled", "verification_required")
        val ids = states.map { state ->
            val job = CabinSubmission(cabinJob(draft, id)).send(api).obj()
            if (state != "queued") api.advance(job.text("id"), state)
            job.text("id")
        }
        val unrelated = CabinSubmission(cabinJob(draft, other)).send(api).obj().text("id")
        updateCabinPassword(api, id, "demo0000", "new-fixture", "尾号 0000")
        api.call("DELETE", "/credentials/$id")
        val jobs = cabinJobs(api.call("GET", "/jobs")).associateBy { it.text("id") }
        states.forEachIndexed { index, state ->
            assertEquals(if (state in listOf("queued", "retry_wait")) "cancelled" else state, jobs.getValue(ids[index]).text("state"))
        }
        assertEquals("queued", jobs.getValue(unrelated).text("state"))
    }
    private suspend fun login(api: PlatformBackend) { api.call("POST", "/auth/login", payload("username" to "demo", "password" to "fixture-only")) }
    @Test fun demoFlowSupportsCredentialsBookingsReceiptsCancellationAndLogout() = runBlocking {
        val api = DemoCabinBackend()
        assertTrue(api.call("GET", "/study-cabin/cabins").objectList().isNotEmpty())
        assertTrue(runCatching { api.call("GET", "/auth/me") }.exceptionOrNull() is PlatformFailure)
        login(api)
        assertTrue(api.call("GET", "/credentials").objectList().isEmpty())
        assertTrue(api.call("GET", "/jobs").objectList().isEmpty())
        val credential = api.call("POST", "/credentials", cabinSecret("demo", "fixture-only", true)).obj()
        assertFalse(credential.containsKey("secret"))
        val id = credential.text("id")
        val updated = api.call("PUT", "/credentials/$id/secret", cabinSecret("demo-new", "replacement-fixture", false)).obj()
        assertEquals(id, updated.text("id")); assertFalse(updated.toString().contains("replacement-fixture"))
        val available = api.call("GET", "/study-cabin/cabins").objectList()
        val draft = cabinDefaults().copy(cabins = available.take(2).map { it.number("dev_id") })
        val submission = CabinSubmission(cabinJob(draft, id))
        val job = api.call("POST", "/jobs", submission.body, submission.key).obj()
        assertEquals("queued", job.text("state"))
        val jobId = job.text("id")
        api.advance(jobId, "succeeded")
        var loaded = api.call("GET", "/jobs").objectList().first()
        assertEquals("succeeded", loaded.text("state")); assertTrue(loaded["receipt"]!!.obj().isNotEmpty())
        assertEquals("", loaded.text("next_action"))
        assertEquals("succeeded", submission.send(api).obj().text("state"))
        api.advance(jobId, "verification_required")
        loaded = api.call("GET", "/jobs").objectList().first()
        assertEquals("verify_upstream", loaded.text("next_action"))
        assertEquals("cancelled", api.call("POST", "/jobs/$jobId/cancel").obj().text("state"))
        api.call("DELETE", "/credentials/$id")
        assertEquals("revoked", api.call("GET", "/credentials").objectList().first().text("status"))
        api.call("POST", "/auth/logout")
        assertTrue(runCatching { api.call("GET", "/jobs") }.exceptionOrNull() is PlatformFailure)
    }

    @Test fun aLostResponseRetriesWithTheSameKeyAndOnlyCreatesOneJob() = runBlocking {
        val api = DemoCabinBackend(); login(api)
        val id = api.call("POST", "/credentials", cabinSecret("demo", "fixture-only", true)).obj().text("id")
        val draft = cabinDefaults().copy(cabins = listOf(api.call("GET", "/study-cabin/cabins").objectList().first().number("dev_id")))
        val submission = CabinSubmission(cabinJob(draft, id))
        val keys = mutableListOf<String?>()
        var dropResponse = true
        val lossy = object : PlatformBackend by api {
            override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
                keys.add(key)
                val response = api.call(method, path, body, key)
                if (dropResponse) { dropResponse = false; throw PlatformFailure(0, "NETWORK", "Fixture lost response") }
                return response
            }
        }
        assertTrue(runCatching { submission.send(lossy) }.isFailure)
        val first = api.call("GET", "/jobs").objectList().first()
        val replay = submission.send(lossy).obj()
        assertEquals(listOf(submission.key, submission.key), keys)
        assertEquals(first.text("id"), replay.text("id"))
        assertEquals(1, api.call("GET", "/jobs").objectList().size)
        val changed = cabinJob(draft.copy(title = "另一笔"), id)
        assertTrue(runCatching { api.call("POST", "/jobs", changed, submission.key) }.exceptionOrNull() is PlatformFailure)
        val next = CabinSubmission(changed)
        assertNotEquals(submission.key, next.key)
        api.call("POST", "/jobs", next.body, next.key)
        assertEquals(2, api.call("GET", "/jobs").objectList().size)
    }
}
