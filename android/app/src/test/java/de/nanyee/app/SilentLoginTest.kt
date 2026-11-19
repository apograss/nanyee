package de.nanyee.app

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.*
import org.junit.Test

class SilentLoginTest {
    private class FakeApi(private val fail: (Int) -> Exception? = { null }) : SchoolDataSource {
        var captchas = 0
        var submissions = 0
        val flows = mutableListOf<String>()
        override suspend fun request(path: String, body: JsonObject?): JsonObject = when (path) {
            "captcha" -> { captchas++; payload("flow_id" to "flow-$captchas", "image_base64" to "fake-image") }
            "session" -> {
                submissions++; flows += body!!.text("flow_id")
                fail(submissions)?.let { throw it }
                payload("academic_session_id" to "memory-only", "expires_at" to "2026-11-19T12:00:00Z")
            }
            else -> error("Unexpected call")
        }
        override suspend fun timetableSemesterStart(body: JsonObject): String = error("Unexpected call")
        override fun clear() = Unit
    }
    private suspend fun login(api: SchoolDataSource) = silentLogin(api, "not-a-student", "not-a-real-password") { "0123" }
    private fun captchaError() = SchoolError(401, "UPSTREAM_REJECTED", "验证码错误", "bad_captcha")

    @Test fun firstSuccessStopsImmediately() = runBlocking {
        val api = FakeApi()
        assertTrue(login(api) is SilentLoginResult.Success)
        assertEquals(1, api.captchas); assertEquals(1, api.submissions)
    }

    @Test fun onlyBadCaptchaRetriesWithAFreshFlowUpToThreeAttempts() = runBlocking {
        val api = FakeApi { if (it < 3) captchaError() else null }
        assertTrue(login(api) is SilentLoginResult.Success)
        assertEquals(listOf("flow-1", "flow-2", "flow-3"), api.flows)
        val exhausted = FakeApi { captchaError() }
        assertEquals("验证码错误", (login(exhausted) as SilentLoginResult.Manual).message)
        assertEquals(3, exhausted.captchas); assertEquals(3, exhausted.submissions)
    }

    @Test fun credentialsRateLimitsAndUnknownErrorsNeverRetry() = runBlocking {
        listOf(
            SchoolError(401, "UPSTREAM_REJECTED", "学号或密码错误", "bad_credentials"),
            SchoolError(429, "RATE_LIMITED", "Retry-After：60"),
            SchoolError(401, "UPSTREAM_REJECTED", "登录失败"),
            SchoolError(0, "NETWORK", "网络连接失败")
        ).forEach { error ->
            val api = FakeApi { error }
            assertEquals(error.message, (login(api) as SilentLoginResult.Manual).message)
            assertEquals(1, api.captchas); assertEquals(1, api.submissions)
        }
    }

    @Test fun recognitionFailureFallsBackWithoutSubmittingAndCancellationPropagates() = runBlocking {
        val api = FakeApi()
        assertTrue(silentLogin(api, "not-a-student", "not-a-real-password") { error("Model unavailable") } is SilentLoginResult.Manual)
        assertEquals(0, api.submissions)
        val result = runCatching { silentLogin(api, "not-a-student", "not-a-real-password") { throw CancellationException() } }
        assertTrue(result.exceptionOrNull() is CancellationException)
        assertEquals(0, api.submissions)
    }

    @Test fun captchaFetchErrorsAndEmptySessionResponsesFallBack() = runBlocking {
        val base = FakeApi()
        val unavailable = object : SchoolDataSource by base {
            override suspend fun request(path: String, body: JsonObject?): JsonObject = throw SchoolError(429, "RATE_LIMITED", "Retry-After：120")
        }
        assertEquals("Retry-After：120", (login(unavailable) as SilentLoginResult.Manual).message)
        assertEquals(0, base.submissions)
        val empty = object : SchoolDataSource by base {
            override suspend fun request(path: String, body: JsonObject?) = if (path == "session") payload() else base.request(path, body)
        }
        assertTrue(login(empty) is SilentLoginResult.Manual)
    }
}
