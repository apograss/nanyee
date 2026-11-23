package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class AccountRegistrationTest {
    @Test fun nativeRegistrationRouteOpensAndRestoresWithoutBrowserNavigation() = runBlocking {
        val saved = mutableMapOf<String, String>()
        val account = model(saved)
        account.refresh()
        assertTrue(account.error.isNotBlank())
        account.navigate(NATIVE_REGISTRATION)
        assertEquals("", account.error)
        assertEquals("register", account.route)
        assertEquals("register", saved["route"])
        assertEquals("register", model(saved).route)
        account.navigate("")
        assertEquals("", account.route)
    }

    @Test fun registrationRateLimitStaysNativeAndDoesNotOfferAWebsite() {
        for (code in listOf("RATE_LIMIT_CHALLENGE_REQUIRED", "HUMAN_VERIFICATION_FAILED")) {
            val message = registrationFailureMessage(PlatformFailure(429, code, "x", ""))
            assertFalse(message.contains("https://"))
            assertTrue(message.contains("稍后重试"))
        }
    }
    private fun model(store: MutableMap<String, String> = mutableMapOf(), backend: PlatformBackend = DemoAccountBackend()) =
        AccountModel(backend, AccountRecovery({ store[it] }, { k, v -> store[k] = v }))

    @Test fun registrationRequestsArePublicWritesWithoutCsrf() {
        listOf("/registration/challenges", "/registration/challenges/abc-1/verify", "/registration").forEach {
            assertTrue(it, platformPublicWrite(it)); assertNull(platformRequest("POST", it, accountPayload(), null).header(platformCsrfHeader))
        }
        assertFalse(platformPublicWrite("/registration/challenges/../verify"))
    }

    @Test fun parsesQuizChallengeAndRejectsMalformedOnes() {
        val expires = Instant.now().plusSeconds(600).toString()
        val quiz = registrationChallenge(accountPayload("challenge_id" to "c-1", "method" to "quiz", "expires_at" to expires, "pass_score" to 18,
            "questions" to JsonArray(listOf(accountPayload("question" to "Q", "options" to JsonArray(listOf(JsonPrimitive("A"), JsonPrimitive("B"))))))))
        assertEquals(RegistrationMethod.QUIZ, quiz.method); assertEquals(18, quiz.passScore); assertEquals(listOf("A", "B"), quiz.questions.single().options)
        assertFalse(quiz.expired())
        listOf(
            accountPayload("challenge_id" to "c/1", "method" to "quiz", "expires_at" to expires),
            accountPayload("challenge_id" to "c-1", "method" to "quiz", "expires_at" to expires),
            accountPayload("challenge_id" to "c-1", "method" to "sms", "expires_at" to expires),
            accountPayload("challenge_id" to "c-1", "method" to "email", "expires_at" to "bad"),
        ).forEach { assertTrue(runCatching { registrationChallenge(it) }.isFailure) }
        assertEquals(Instant.parse("2026-11-21T02:30:00Z"), platformInstant("2026-11-21T02:30:00.123456+00:00").let { Instant.ofEpochSecond(it.epochSecond) })
        assertTrue(registrationChallenge(accountPayload("challenge_id" to "c-1", "method" to "email", "expires_at" to expires, "masked_email" to "d***@smu.edu.cn")).canResend())
    }

    @Test fun failureMessagesExplainQuizScoreAndRestartWhenUsedUp() {
        val wrong = PlatformFailure(422, "INVALID_REQUEST", "x", "验证未通过。", accountPayload("attempts_remaining" to 2, "score" to 15, "required_score" to 18))
        assertEquals("答对 15 题，需答对 18 题。还可再交 2 次。", registrationFailureMessage(wrong)); assertFalse(registrationRestartNeeded(wrong))
        val used = PlatformFailure(422, "INVALID_REQUEST", "x", "验证未通过。", accountPayload("attempts_remaining" to 0, "score" to 15, "required_score" to 18))
        assertTrue(registrationRestartNeeded(used))
        assertTrue(registrationRestartNeeded(PlatformFailure(410, "INVALID_REQUEST", "x", "注册验证已过期。")))
        assertTrue(registrationRestartNeeded(PlatformFailure(429, "RATE_LIMITED", "x", "验证次数已用完，请重新开始。")))
        val taken = PlatformFailure(409, "CONFLICT", "x", "用户名或邮箱已被使用。")
        assertFalse(registrationRestartNeeded(taken)); assertEquals("用户名或邮箱已被使用。", registrationFailureMessage(taken))
        assertTrue(registrationFailureMessage(PlatformFailure(429, "RATE_LIMIT_CHALLENGE_REQUIRED", "x")).contains("稍后重试"))
    }

    @Test fun quizRegistrationSignsInAndClearsPasswords() = runBlocking {
        val store = mutableMapOf<String, String>()
        val model = model(store)
        model.navigate("register"); model.startRegistration()
        val challenge = requireNotNull(model.registration)
        assertEquals(3, challenge.questions.size); assertTrue(store.getValue("registration").contains("demo-registration"))
        model.verifyRegistration(); assertTrue(model.error, model.error.contains("答完")); assertFalse(model.registrationVerified)
        model.answer(0, 0); model.answer(1, 0); model.answer(2, 0); model.verifyRegistration()
        assertTrue(model.error, model.error.contains("答对 0 题")); assertNotNull(model.registration)
        model.answer(0, 1); model.answer(1, 1); model.answer(2, 9); model.verifyRegistration()
        assertTrue(model.registrationVerified); assertEquals("true", store["registrationVerified"])
        assertEquals(RegistrationMethod.QUICK, model(store).registration?.method)
        model.username = "bad name"; model.password = "long-enough"; model.passwordAgain = "long-enough"; model.register()
        assertTrue(model.error.contains("用户名")); assertNull(model.user)
        model.username = "demo"; model.password = "long-enough"; model.passwordAgain = "different"; model.register()
        assertTrue(model.error.contains("不一致"))
        model.password = "long-enough"; model.passwordAgain = "long-enough"; model.register()
        assertEquals("用户名或邮箱已被使用。", model.error); assertTrue(model.registrationVerified); assertEquals("", model.password)
        model.username = "new_student"; model.nickname = "小南"; model.password = "long-enough"; model.passwordAgain = "long-enough"; model.register()
        assertEquals("", model.error); assertEquals("new_student", model.user?.text("username")); assertEquals("小南", model.user?.text("nickname"))
        assertNull(model.registration); assertEquals("", model.route); assertEquals("", store["registration"])
        assertEquals("", model.password); assertEquals("", model.passwordAgain); assertTrue(model.message.contains("绑定邮箱"))
    }

    @Test fun emailRegistrationRequiresEduAddressAndCode() = runBlocking {
        val model = model()
        model.navigate("register"); model.chooseRegisterMethod(RegistrationMethod.EMAIL)
        model.email = "someone@gmail.com"; model.startRegistration(); assertTrue(model.error.contains(".edu.cn")); assertNull(model.registration)
        model.email = "student@smu.edu.cn"; model.startRegistration(); assertEquals(RegistrationMethod.EMAIL, model.registration?.method)
        model.code = "12"; model.verifyRegistration(); assertTrue(model.error.contains("六位"))
        model.code = "000000"; model.verifyRegistration(); assertTrue(model.error.contains("验证码不正确")); assertFalse(model.registrationVerified)
        model.code = "123456"; model.verifyRegistration(); assertTrue(model.registrationVerified)
        model.username = "student_1"; model.password = "long-enough"; model.passwordAgain = "long-enough"; model.register()
        assertEquals("student@smu.edu.cn", model.user?.text("email"))
    }

    @Test fun signedOutRefreshKeepsRegistrationInProgress() = runBlocking {
        val model = model()
        model.navigate("register"); model.startRegistration(); model.refresh()
        assertEquals("register", model.route); assertNotNull(model.registration)
    }

    @Test fun leavingRegistrationOrSwitchingMethodDropsChallenge() = runBlocking {
        val model = model()
        model.navigate("register"); model.startRegistration(); assertNotNull(model.registration)
        model.chooseRegisterMethod(RegistrationMethod.EMAIL); assertNull(model.registration)
        model.chooseRegisterMethod(RegistrationMethod.QUICK); model.startRegistration(); model.navigate(""); assertNull(model.registration)
    }

    @Test fun quickRegistrationFallsBackToFullQuizOnOlderServer() = runBlocking {
        val sent = mutableListOf<String>()
        val backend = object : PlatformBackend {
            override suspend fun clearLocal() = Unit
            override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
                sent += body?.text("method").orEmpty()
                if (body?.text("method") == "quick") throw PlatformFailure(422, "INVALID_REQUEST", "x", "请求参数无效。")
                return accountPayload("challenge_id" to "c-1", "method" to "quiz", "expires_at" to Instant.now().plusSeconds(600).toString(), "pass_score" to 1,
                    "questions" to JsonArray(listOf(accountPayload("question" to "Q", "options" to JsonArray(listOf(JsonPrimitive("A"), JsonPrimitive("B")))))))
            }
        }
        val model = model(backend = backend)
        assertEquals(RegistrationMethod.QUICK, model.registerMethod)
        model.navigate("register"); model.startRegistration()
        assertEquals(listOf("quick", "quiz"), sent); assertEquals(RegistrationMethod.QUIZ, model.registration?.method); assertEquals("", model.error)
    }

    @Test fun expiredServerChallengeRestarts() = runBlocking {
        val backend = object : PlatformBackend {
            override suspend fun clearLocal() = Unit
            override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement =
                if (path == "/registration/challenges") accountPayload("challenge_id" to "c-1", "method" to "quiz", "expires_at" to Instant.now().plusSeconds(600).toString(),
                    "questions" to JsonArray(listOf(accountPayload("question" to "Q", "options" to JsonArray(listOf(JsonPrimitive("A"), JsonPrimitive("B")))))), "pass_score" to 1)
                else throw PlatformFailure(410, "INVALID_REQUEST", "x", "注册验证已过期。")
        }
        val model = model(backend = backend)
        model.navigate("register"); model.startRegistration(); model.answer(0, 1); model.verifyRegistration()
        assertNull(model.registration); assertTrue(model.error.contains("重新开始"))
    }
}
