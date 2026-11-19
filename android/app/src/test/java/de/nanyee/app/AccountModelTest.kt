package de.nanyee.app

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class AccountModelTest {
    private class Fixture {
        val backend = DemoAccountBackend()
        val saved = mutableMapOf<String, String>()
        val calls = mutableListOf<Pair<String, String>>()
        var cleared = 0
        val hidden = mutableMapOf<String, Set<String>>()
        var interceptor: (suspend (String) -> Unit)? = null
        val wire = object : PlatformBackend {
            override suspend fun clearLocal() { cleared++; backend.clearLocal() }
            override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
                calls += method to path; interceptor?.invoke(path); return backend.call(method, path, body, key)
            }
        }
        fun model() = AccountModel(wire, AccountRecovery({ saved[it] }, { k, v -> saved[k] = v }), { hidden[it].orEmpty() }, { owner, ids -> hidden[owner] = ids })
        val model = model()
        suspend fun login() { model.username = "demo"; model.password = "fixture-only"; model.review(AccountWrite.LOGIN); model.confirm(); assertNotNull(model.user) }
    }

    @Test fun loginLogoutRequireConfirmationAndPasswordsAreNeverRecovered() = runBlocking {
        val f = Fixture(); val m = f.model
        m.review(AccountWrite.LOGIN); assertNull(m.pending); assertTrue(f.calls.isEmpty())
        m.username = "demo"; m.password = "fixture-only"; m.review(AccountWrite.LOGIN)
        assertNotNull(m.pending); assertTrue(f.calls.isEmpty()); assertEquals("", m.password)
        m.dismissConfirmation(); m.confirm(); assertTrue(f.calls.isEmpty())
        f.login(); assertEquals("demo", m.user!!.text("username")); assertEquals(3, m.credentials.size); assertEquals(2, m.jobs.size)
        m.review(AccountWrite.LOGOUT); assertNotNull(m.user); m.confirm()
        assertNull(m.user); assertEquals(1, f.cleared); assertTrue(f.calls.contains("POST" to "/auth/logout"))
        assertFalse(f.saved.values.any { it.contains("fixture-only") }); assertFalse(f.model().password.isNotBlank())
    }

    @Test fun signedOutPasswordRecoveryUsesPublicChallengeAndClearsAllLocalState() = runBlocking {
        val f = Fixture(); val m = f.model
        m.navigate("reset"); m.email = "demo@example.invalid"
        m.review(AccountWrite.RESET_CODE); assertTrue(f.calls.isEmpty()); m.confirm()
        assertNotNull(m.challenge); assertEquals("reset", f.saved["route"])
        m.code = "123456"; m.newPassword = "new-fixture-only"; m.review(AccountWrite.RESET_CONFIRM)
        assertEquals("", m.newPassword); assertEquals("", m.code); assertNotNull(m.pending)
        m.confirm(); assertNull(m.user); assertNull(m.challenge); assertTrue(m.message.contains("所有平台会话")); assertEquals(1, f.cleared)
        assertFalse(f.saved.values.any { it.contains("new-fixture") || it.contains("123456") })
    }

    @Test fun emailBindChangeAndUnbindMatchWebsiteRequirements() = runBlocking {
        val f = Fixture(); f.login(); val m = f.model; m.navigate("email")
        m.email = "new@example.invalid"; m.review(AccountWrite.EMAIL_CODE); assertNull(m.pending)
        m.password = "fixture-password"; m.review(AccountWrite.EMAIL_CODE); m.confirm(); assertNotNull(m.challenge)
        val before = f.calls.size; m.review(AccountWrite.EMAIL_CODE); assertNull(m.pending); assertEquals(before, f.calls.size)
        m.code = "bad"; m.review(AccountWrite.EMAIL_CONFIRM); assertNull(m.pending)
        m.code = "123456"; m.review(AccountWrite.EMAIL_CONFIRM); m.confirm(); assertEquals("new@example.invalid", m.user!!.text("email"))
        assertNull(m.challenge)
        m.review(AccountWrite.EMAIL_UNBIND); assertNull(m.pending)
        m.password = "fixture-password"; m.review(AccountWrite.EMAIL_UNBIND); m.confirm(); assertEquals("", m.user!!.text("email"))
        m.email = "bound@example.invalid"; m.review(AccountWrite.EMAIL_CODE); m.confirm()
        m.code = "123456"; m.review(AccountWrite.EMAIL_CONFIRM); m.confirm(); assertEquals("bound@example.invalid", m.user!!.text("email"))
    }

    @Test fun restoreKeepsOnlyRouteChallengeAndJobSelectionNotSecretsOrReveals() = runBlocking {
        val f = Fixture(); f.login(); val m = f.model
        m.navigate("email"); m.email = "new@example.invalid"; m.password = "fixture-password"; m.review(AccountWrite.EMAIL_CODE); m.confirm()
        val restored = f.model(); restored.refresh()
        assertEquals("email", restored.route); assertEquals(m.challenge, restored.challenge)
        assertEquals("", restored.password); assertNull(restored.pending)
        restored.code = "123456"; restored.review(AccountWrite.EMAIL_CONFIRM); restored.clearTransient(); restored.confirm()
        assertEquals("demo@example.invalid", restored.user!!.text("email"))
        restored.openJob("demo-job"); val resumed = f.model(); resumed.refresh()
        assertEquals("demo-job", resumed.job!!.text("id"))
        assertEquals("job", resumed.route)
    }

    @Test fun credentialsHaveConfirmedUpdateRenewRevokeDeleteAndScreenOnlyReveal() = runBlocking {
        val f = Fixture(); f.login(); val m = f.model; m.navigate("credentials")
        val before = f.calls.size
        m.review(AccountWrite.REVEAL, "demo-school"); assertEquals("", m.revealed); assertEquals(before, f.calls.size)
        m.confirm(); assertEquals("demo-only-secret-not-real", m.revealed); assertFalse(f.saved.toString().contains(m.revealed))
        m.clearTransient(); assertEquals("", m.revealed)
        m.editCredential("demo-school"); m.schoolAccount = "fixture-account"; m.secret = "new-fixture"
        m.review(AccountWrite.UPDATE, "demo-school"); assertEquals("", m.secret)
        val secret = m.pending!!.body!!.text("secret"); assertEquals("new-fixture", Json.parseToJsonElement(secret).jsonObject.text("password"))
        m.confirm(); assertTrue(f.calls.contains("PUT" to "/credentials/demo-school/secret"))
        m.review(AccountWrite.RENEW, "demo-school"); assertNull(m.pending)
        m.ttlDays = "0"; m.review(AccountWrite.RENEW, "demo-token"); assertNull(m.pending)
        m.ttlDays = "180"; m.review(AccountWrite.RENEW, "demo-token"); assertEquals(15552000, m.pending!!.body!!["ttl_seconds"]!!.jsonPrimitive.int); m.confirm()
        m.review(AccountWrite.REVOKE, "demo-token"); m.confirm(); assertEquals("revoked", m.credentials.first { it.text("id") == "demo-token" }.text("status"))
        m.review(AccountWrite.DELETE, "demo-token"); m.confirm(); assertFalse(m.credentials.any { it.text("id") == "demo-token" })
    }

    @Test fun jobsIncludeReceiptAndCancellationAndNoticesDismissOnlyLocally() = runBlocking {
        val f = Fixture(); f.login(); val m = f.model
        m.openJob("demo-job"); assertTrue(accountReceipt(m.job!!["receipt"]!!).contains("离线演示"))
        m.review(AccountWrite.CANCEL, "demo-job"); assertEquals("queued", m.job!!.text("state")); m.confirm()
        assertEquals("cancelled", m.job!!.text("state"))
        val before = f.calls.size; m.dismissNotice("demo-notice"); m.dismissNotice("demo-warning")
        assertEquals(before, f.calls.size); assertEquals(listOf("demo-warning"), m.notices.map { it.text("id") })
        val restored = f.model(); restored.refresh(); assertFalse(restored.notices.any { it.text("id") == "demo-notice" })
    }

    @Test fun revealFinishingAfterScreenClosesCannotReappear() = runBlocking {
        val f = Fixture(); f.login(); val m = f.model
        val entered = CompletableDeferred<Unit>(); val resume = CompletableDeferred<Unit>()
        f.interceptor = { path -> if (path.endsWith("/reveal")) { entered.complete(Unit); resume.await() } }
        m.review(AccountWrite.REVEAL, "demo-school")
        val write = launch { m.confirm() }; entered.await(); m.clearTransient(); resume.complete(Unit); write.join()
        assertEquals("", m.revealed)
    }

    @Test fun emptyListsAndSessionExpiryClearSensitiveStateAndDoNotReplayWrites() = runBlocking {
        val f = Fixture(); f.login(); val m = f.model
        f.backend.failure = AccountDemoFailure.EMPTY; m.refresh()
        assertTrue(m.credentials.isEmpty()); assertTrue(m.jobs.isEmpty()); assertTrue(m.notices.isEmpty())
        f.backend.failure = AccountDemoFailure.SESSION; m.password = "not-persisted"; m.refresh()
        assertNull(m.user); assertEquals("", m.password); assertNull(m.pending); assertTrue(m.error.contains("重新登录"))
        val before = f.calls.size; m.confirm(); assertEquals(before, f.calls.size)
    }

    private suspend fun prepared(kind: AccountWrite): Fixture {
        val f = Fixture(); val m = f.model
        if (kind !in setOf(AccountWrite.LOGIN, AccountWrite.RESET_CODE, AccountWrite.RESET_CONFIRM)) f.login()
        when (kind) {
            AccountWrite.LOGIN -> { m.username = "demo"; m.password = "fixture-password" }
            AccountWrite.EMAIL_CODE -> { m.navigate("email"); m.email = "new@example.invalid"; m.password = "fixture-password" }
            AccountWrite.EMAIL_CONFIRM -> { m.navigate("email"); m.email = "new@example.invalid"; m.password = "fixture-password"; m.review(AccountWrite.EMAIL_CODE); m.confirm(); m.code = "123456" }
            AccountWrite.EMAIL_UNBIND -> m.password = "fixture-password"
            AccountWrite.RESET_CODE, AccountWrite.RESET_CONFIRM -> { m.navigate("reset"); m.email = "demo@example.invalid"; if (kind == AccountWrite.RESET_CONFIRM) { m.review(AccountWrite.RESET_CODE); m.confirm(); m.code = "123456"; m.newPassword = "new-fixture-password" } }
            AccountWrite.UPDATE -> { m.schoolAccount = "fixture-account"; m.secret = "fixture-password" }
            else -> Unit
        }
        m.review(kind, when (kind) { AccountWrite.RENEW -> "demo-token"; AccountWrite.CANCEL -> "demo-job"; else -> "demo-school" })
        assertNotNull(kind.name, m.pending)
        return f
    }

    @Test fun allDemoFlowsHaveSuccessAndFailureOutcomesWithoutAutomaticRetries() = runBlocking {
        AccountWrite.entries.forEach { kind ->
            val successful = prepared(kind); successful.model.confirm(); assertEquals(kind.name, "", successful.model.error)
            listOf(AccountDemoFailure.REJECTED, AccountDemoFailure.CHALLENGE, AccountDemoFailure.NETWORK, AccountDemoFailure.SESSION).forEach { failure ->
                val f = prepared(kind); f.backend.failure = failure; val before = f.calls.size
                f.model.confirm(); assertTrue("$kind $failure", f.model.error.isNotBlank()); assertNull(f.model.pending)
                assertEquals(before + 1, f.calls.size); f.model.confirm(); assertEquals(before + 1, f.calls.size)
                if (failure == AccountDemoFailure.CHALLENGE) assertTrue(f.model.error.contains("请在网页完成验证"))
                if (failure == AccountDemoFailure.SESSION) assertNull(f.model.user)
            }
        }
    }
}
