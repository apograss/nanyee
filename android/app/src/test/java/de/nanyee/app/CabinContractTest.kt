package de.nanyee.app

import kotlinx.serialization.json.*
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.time.ZonedDateTime

class CabinContractTest {
    private val now = Instant.parse("2026-07-21T10:00:00Z")
    private val valid = CabinDraft("2026-07-22", cabins = listOf(101, 102), scheduled = "2026-07-21T23:59:00+08:00", until = "2026-07-22T08:50:00+08:00")
    private val available = setOf(101, 102)

    @Test fun requestContainsOnlyDocumentedFieldsAndHeaders() {
        val body = cabinJob(valid, "fixture-credential")
        val request = platformRequest("POST", "/jobs", body, "test-csrf", "fixture-idempotency-key")
        assertEquals("https://nanyee.de/api/v1/jobs", request.url.toString())
        assertEquals("test-csrf", request.header("X-CSRF-Token"))
        assertEquals("fixture-idempotency-key", request.header("Idempotency-Key"))
        val buffer = Buffer(); request.body!!.writeTo(buffer)
        assertEquals(body, Json.parseToJsonElement(buffer.readUtf8()))
        assertEquals("study_cabin:reserve:v1", body.text("confirmation_version"))
        assertEquals("fixture-credential", body.text("credential_id"))
        assertEquals(setOf("tool_id", "operation", "credential_id", "confirmation_version", "scheduled_for", "payload"), body.keys)
        assertEquals(listOf(101, 102), body["payload"]!!.obj()["cabin_ids"]!!.jsonArray.map { it.jsonPrimitive.int })
        fun assertSafe(value: JsonElement) {
            when (value) {
                is JsonObject -> value.forEach { (key, child) -> assertFalse(key, listOf("password", "secret", "token", "cookie", "session", "authorization").any { key.lowercase().contains(it) }); assertSafe(child) }
                is JsonArray -> value.forEach(::assertSafe)
                else -> Unit
            }
        }
        assertSafe(body)
        assertEquals("application/json; charset=utf-8", request.body!!.contentType().toString())
    }

    @Test fun writesRequireCsrfAndPathsCannotEscapePlatform() {
        listOf("/auth/logout", "/credentials", "/credentials/test/secret", "/jobs", "/jobs/test/cancel").forEach { path ->
            assertTrue(runCatching { platformRequest("POST", path, payload(), null) }.isFailure)
        }
        assertNull(platformRequest("POST", "/auth/login", payload("username" to "demo", "password" to "fixture-only"), null).header("X-CSRF-Token"))
        assertNull(platformRequest("GET", "/study-cabin/cabins", null, null).header("Idempotency-Key"))
        assertEquals("csrf", platformRequest("DELETE", "/credentials/test", null, "csrf").header("X-CSRF-Token"))
        assertTrue(runCatching { platformRequest("GET", "https://example.com", null, null) }.isFailure)
        assertTrue(runCatching { platformRequest("POST", "/../infospace", payload(), "csrf") }.isFailure)
    }

    @Test fun credentialSecretsAreLimitedToExplicitCredentialRequests() {
        val create = cabinSecret("fixture-account-1234", "fixture-only-password", true)
        assertEquals("credential-hosting-v1", create.text("consent_version"))
        assertEquals("infospace", create.text("upstream")); assertEquals("study_cabin", create.text("purpose"))
        assertEquals("尾号 1234", create["metadata"]!!.obj().text("account_hint"))
        assertEquals("fixture-only-password", Json.parseToJsonElement(create.text("secret")).obj().text("password"))
        val update = cabinSecret("fixture-account-1234", "replacement-fixture", false)
        assertEquals(setOf("secret", "metadata"), update.keys)
        assertFalse(update.toString().contains("fixture-only-password"))
        assertEquals("尾号 *", cabinSecret("x", "fixture-only", true)["metadata"]!!.obj().text("account_hint"))
    }

    @Test fun validationCoversDurationOpeningHoursPriorityAndDeadlines() {
        assertNull(validateCabin(valid, available, now))
        assertNull(validateCabin(valid.copy(start = "08:00", end = "08:30", until = "2026-07-22T08:00+08:00"), available, now))
        assertNull(validateCabin(valid.copy(start = "18:50", end = "22:50"), available, now))
        listOf(
            valid.copy(start = "09:01"), valid.copy(end = "09:20"), valid.copy(end = "13:10"),
            valid.copy(start = "07:50"), valid.copy(end = "23:00"), valid.copy(start = "bad"),
            valid.copy(date = "2026-02-30"), valid.copy(title = ""), valid.copy(title = "字".repeat(31)),
            valid.copy(cabins = emptyList()), valid.copy(cabins = listOf(101, 101)), valid.copy(cabins = listOf(999)),
            valid.copy(until = "2026-07-22T09:10+08:00"), valid.copy(until = "2026-07-22T08:50"),
            valid.copy(until = "2026-07-20T08:50+08:00"), valid.copy(scheduled = valid.until),
            valid.copy(scheduled = "2026-09-21T23:59+08:00"), valid.copy(scheduled = "invalid")
        ).forEach { assertNotNull(validateCabin(it, available, now)) }
    }

    @Test fun defaultsUseBeijingTomorrowAndDoNotInventAReleaseTime() {
        val localNow = ZonedDateTime.parse("2026-07-21T23:59:30+08:00[Asia/Shanghai]")
        val draft = cabinDefaults(localNow)
        assertEquals("2026-07-22", draft.date)
        assertEquals("2026-07-21T23:59+08:00", draft.scheduled)
        assertEquals("2026-07-22T08:50+08:00", draft.until)
        assertNull(validateCabin(draft.copy(cabins = listOf(101)), available, localNow.toInstant()))
    }

    @Test fun statusAndRecoveryLabelsCoverEveryServerState() {
        assertEquals(listOf("等待预约", "正在尝试", "等待重试", "预约成功", "预约失败", "已取消", "需要核验"), listOf("queued", "running", "retry_wait", "succeeded", "failed", "cancelled", "verification_required").map(::cabinStatus))
        assertEquals("未知状态", cabinStatus("future"))
        assertTrue(cabinNextAction("verify_upstream").contains("不要重复预约"))
        assertTrue(cabinNextAction("replace_credential").contains("更新"))
        assertTrue(cabinNextAction("future").contains("nanyee.de"))
    }

    @Test fun rateLimitsUseSecondsOrHttpDateAndChallengesLinkToWebsite() {
        val millis = now.toEpochMilli()
        assertEquals(millis + 120000, platformRetryAt("120", millis))
        assertEquals(millis + 60000, platformRetryAt(null, millis))
        assertEquals(millis + 60000, platformRetryAt("invalid", millis))
        assertEquals(millis + 120000, platformRetryAt("Tue, 21 Jul 2026 10:02:00 GMT", millis))
        assertEquals(Long.MAX_VALUE, platformRetryAt(Long.MAX_VALUE.toString(), millis))
        assertTrue(platformErrorMessage(429, "RATE_LIMIT_CHALLENGE_REQUIRED").contains("nanyee.de"))
        assertTrue(platformErrorMessage(429, "RATE_LIMITED").contains("等待时间"))
        assertTrue(platformErrorMessage(401, "AUTHENTICATION_REQUIRED").contains("重新登录"))
    }

    private class MemoryCookies : PlatformCookieStorage {
        var value = ""
        override fun read() = value
        override fun write(value: String) { this.value = value }
    }

    @Test fun platformCookiesRoundTripScopeExpiryAndLogout() {
        val storage = MemoryCookies()
        val origin = "https://nanyee.de/".toHttpUrl()
        val jar = PlatformCookies(storage)
        jar.saveFromResponse(origin, listOf(Cookie.parse(origin, "nanyee_session=fixture-session; Path=/; Secure; HttpOnly; Max-Age=3600")!!, Cookie.parse(origin, "nanyee_csrf=fixture-csrf; Path=/; Secure; Max-Age=3600")!!))
        val restored = PlatformCookies(storage)
        assertEquals(2, restored.loadForRequest(origin).size)
        assertEquals("fixture-csrf", restored.csrf())
        assertTrue(restored.loadForRequest("https://example.com/".toHttpUrl()).isEmpty())
        assertTrue(restored.loadForRequest("http://nanyee.de/".toHttpUrl()).isEmpty())
        restored.saveFromResponse(origin, listOf(Cookie.parse(origin, "nanyee_csrf=deleted; Path=/; Max-Age=0")!!))
        assertNull(restored.csrf())
        restored.clear(); assertEquals("", storage.value)
        assertTrue(PlatformCookies(storage).loadForRequest(origin).isEmpty())
    }
}
