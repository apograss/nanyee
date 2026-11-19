package de.nanyee.app

import kotlinx.serialization.json.*
import okio.Buffer
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class AccountContractTest {
    @Test fun jobDetailsUseServerFieldNamesAndIgnoreLegacyAttempts() {
        val row = accountPayload("operation" to "reserve", "state" to "failed", "created_at" to "created", "updated_at" to "updated", "attempt_count" to 3, "attempts" to 999, "error_code" to "UPSTREAM_UNAVAILABLE", "next_action" to "retry")
        assertEquals("reserve · failed\n创建：created\n更新：updated\n尝试：3\n错误：UPSTREAM_UNAVAILABLE\n后续：retry", accountJobDetails(row))
        assertTrue(accountJobDetails(accountPayload("attempt_count" to 0)).contains("尝试：0\n"))
        assertFalse(accountJobDetails(accountPayload("attempts" to 999)).contains("999"))
        assertTrue(accountJobDetails(accountPayload()).contains("尝试：\n"))
    }

    @Test fun everyAccountRequestStaysOnPlatformWithCorrectCsrfAndMethod() {
        val requests = listOf(
            "POST" to "/auth/login", "GET" to "/auth/me", "POST" to "/auth/logout",
            "POST" to "/account/email/challenges", "POST" to "/account/email/confirm", "POST" to "/account/email/unbind",
            "POST" to "/account/password-reset", "POST" to "/account/password-reset/confirm",
            "GET" to "/credentials", "PUT" to "/credentials/fixture/secret", "POST" to "/credentials/fixture/reveal",
            "POST" to "/credentials/fixture/renew", "DELETE" to "/credentials/fixture", "DELETE" to "/credentials/fixture?hard=true",
            "GET" to "/jobs", "GET" to "/jobs/fixture", "POST" to "/jobs/fixture/cancel", "GET" to "/notices"
        )
        requests.forEach { (method, path) ->
            val request = platformRequest(method, path, accountPayload("fixture" to "value"), "fixture-csrf")
            assertEquals(method, request.method); assertEquals("nanyee.de", request.url.host)
            assertEquals("https://nanyee.de/api/v1$path", request.url.toString())
            if (method != "GET" && !platformPublicWrite(path)) {
                assertEquals("fixture-csrf", request.header(platformCsrfHeader))
                assertTrue(runCatching { platformRequest(method, path, null, null) }.isFailure)
            } else assertNull(request.header(platformCsrfHeader))
        }
        assertNull(platformRequest("POST", "/account/password-reset", accountPayload("email" to "fixture@example.invalid"), null).header(platformCsrfHeader))
        listOf("/account/../../auth/me", "/credentials/id?hard=false", "/jobs/id?anything=true", "/account/nickname", "https://evil.invalid", "/credentials/id/reveal?hard=true").forEach { path ->
            assertTrue(path, runCatching { platformRequest("GET", path, null, "csrf") }.isFailure)
        }
    }

    @Test fun credentialWritesUseExactPathsAndPayloadWithoutCreatingCredentials() {
        val secret = accountPayload("secret" to "fixture-only")
        val actions = listOf(
            accountCredentialAction(AccountWrite.UPDATE, "fixture", secret), accountCredentialAction(AccountWrite.RENEW, "fixture", accountPayload("ttl_seconds" to 86400)),
            accountCredentialAction(AccountWrite.REVOKE, "fixture"), accountCredentialAction(AccountWrite.DELETE, "fixture"), accountCredentialAction(AccountWrite.REVEAL, "fixture")
        )
        assertEquals(listOf("/credentials/fixture/secret", "/credentials/fixture/renew", "/credentials/fixture", "/credentials/fixture?hard=true", "/credentials/fixture/reveal"), actions.map { it.path })
        assertEquals(listOf("PUT", "POST", "DELETE", "DELETE", "POST"), actions.map { it.method })
        val request = platformRequest(actions[0].method, actions[0].path, actions[0].body, "csrf")
        val buffer = Buffer(); request.body!!.writeTo(buffer)
        assertEquals(secret, Json.parseToJsonElement(buffer.readUtf8()))
        assertEquals(86400, actions[1].body!!["ttl_seconds"]!!.jsonPrimitive.int)
        assertTrue(runCatching { accountCredentialAction(AccountWrite.DELETE, "../other") }.isFailure)
    }

    @Test fun parsingHandlesNormalEmptyMalformedAndExpiredChallenges() {
        val challenge = accountChallenge(accountPayload("challenge_id" to "fixture", "expires_at" to "2026-12-01T00:00:00Z", "resend_at" to "2026-11-01T00:00:00Z", "masked_email" to "a***@example.invalid"))
        assertFalse(challenge.expired(Instant.parse("2026-11-19T00:00:00Z")))
        assertTrue(challenge.canResend(Instant.parse("2026-11-19T00:00:00Z")))
        assertTrue(challenge.expired(Instant.parse("2026-12-01T00:00:00Z")))
        assertEquals(emptyList<JsonObject>(), accountRows(JsonArray(emptyList())))
        assertEquals(1, accountRows(JsonArray(listOf(accountPayload("id" to "fixture")))).size)
        listOf(JsonNull, accountPayload(), JsonArray(listOf(JsonPrimitive("wrong"))), JsonArray(listOf(accountPayload()))).forEach { assertTrue(runCatching { accountRows(it) }.isFailure) }
        assertTrue(runCatching { accountChallenge(accountPayload("challenge_id" to "x", "expires_at" to "bad")) }.isFailure)
        assertEquals("永久", (JsonNull as JsonElement).let { accountPayload("expires_at" to it).text("expires_at").ifBlank { "永久" } })
    }

    @Test fun receiptsAndFailureMessagesNeverExposeSensitiveFieldsOrServerText() {
        val text = accountReceipt(accountPayload("logs" to JsonArray(listOf(accountPayload("password" to "hidden-fixture", "access_token" to "also-hidden", "message" to "visible")))))
        assertTrue(text.contains("visible")); assertFalse(text.contains("hidden-fixture")); assertFalse(text.contains("also-hidden"))
        assertEquals("暂无回执", accountReceipt(JsonNull))
        assertTrue(accountFailureMessage(PlatformFailure(429, "RATE_LIMIT_CHALLENGE_REQUIRED", "ignored")).contains("请在网页完成验证"))
        assertTrue(accountFailureMessage(PlatformFailure(401, "", "ignored")).contains("重新登录"))
        assertTrue(accountFailureMessage(PlatformFailure(422, "", "ignored")).contains("核对"))
    }
}
