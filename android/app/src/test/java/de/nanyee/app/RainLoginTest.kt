package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class RainLoginTest {
    private val proof = RainCaptchaProof("fixture-ticket", "fixture-rand")
    @Test fun freshInvalidAndImplicitWwwDefaultsMigrateOnceWithoutMovingCookies() {
        for (saved in listOf("", "invalid", "WWW")) {
            val store = MemoryRainStore().also { it.write("host", saved); it.write("cookies.WWW", "old-session") }
            assertEquals(RainHost.CHANGJIANG, rainInitialHost(store))
            assertEquals("1", store.read("changjiang-default-v1")); assertEquals("old-session", store.read("cookies.WWW")); assertEquals("", store.read("cookies.CHANGJIANG"))
            store.write("host", "WWW")
            assertEquals(RainHost.WWW, rainInitialHost(store))
        }
    }
    @Test fun explicitWwwAndOtherHostsRemainSelected() {
        RainHost.entries.forEach { host ->
            val store = MemoryRainStore().also { it.write("host", host.name); it.write("host.explicit", host.name) }
            assertEquals(host, rainInitialHost(store)); assertEquals(host, rainInitialHost(store))
        }
    }
    @Test fun phoneAndEmailPasswordBodiesMatchReferenceExactly() {
        for ((account, type) in listOf("13800000000" to 1, "student@example.invalid" to 2)) {
            val body = rainLoginBody(RainLoginMethod.PASSWORD, account, "fixture-password", proof, "device")
            assertEquals(setOf("type", "phoneNumber", "email", "password", "code", "pushDeviceId", "ticket", "rand"), body.keys)
            assertEquals(type, body.number("type")); assertEquals(if (type == 1) account else "", body.text("phoneNumber")); assertEquals(if (type == 2) account else "", body.text("email"))
            assertEquals("fixture-password", body.text("password")); assertEquals("", body.text("code")); assertEquals("device", body.text("pushDeviceId")); assertEquals(proof.ticket, body.text("ticket")); assertEquals(proof.rand, body.text("rand"))
        }
    }
    @Test fun smsSendVerifyAndLoginBodiesMatchReferenceExactly() {
        assertEquals(Json.parseToJsonElement("""{"phoneNumber":"13800000000","email":"","ticket":"fixture-ticket","rand":"fixture-rand"}"""), rainSmsBody("13800000000", proof))
        assertEquals(Json.parseToJsonElement("""{"phoneNumber":"13800000000","email":"","code":"123456"}"""), rainVerifyBody("13800000000", "123456"))
        val body = rainLoginBody(RainLoginMethod.SMS, "13800000000", "123456", proof, "device")
        assertEquals(3, body.number("type")); assertEquals("", body.text("password")); assertEquals("", body.text("email")); assertEquals("123456", body.text("code")); assertEquals("fixture-rand", body.text("rand"))
    }
    @Test fun emptyOrInvalidCredentialsAreRejectedBeforeRequests() {
        assertTrue(runCatching { RainCaptchaProof("", "rand") }.isFailure)
        assertTrue(runCatching { RainCaptchaProof("ticket", " ") }.isFailure)
        assertTrue(runCatching { rainSmsBody("", proof) }.isFailure)
        assertTrue(runCatching { rainVerifyBody("13800000000", "letters") }.isFailure)
        assertTrue(runCatching { rainLoginBody(RainLoginMethod.PASSWORD, "", "password", proof, "device") }.isFailure)
        assertTrue(runCatching { rainLoginBody(RainLoginMethod.PASSWORD, "account", "", proof, "device") }.isFailure)
        assertTrue(runCatching { rainLoginBody(RainLoginMethod.SMS, "13800000000", "", proof, "device") }.isFailure)
    }
    @Test fun captchaRequiresSuccessAndNonemptyProofAndRejectsMalformedRet() {
        assertEquals(proof, rainCaptchaProof("""{"ret":0,"ticket":"fixture-ticket","randstr":"fixture-rand"}"""))
        for (value in listOf("", "[]", "{}", """{"ret":"bad","ticket":"t","randstr":"r"}""", """{"ret":2,"ticket":"t","randstr":"r"}""", """{"ret":0,"ticket":"","randstr":"r"}""", """{"ret":0,"ticket":"t"}""")) assertNull(rainCaptchaProof(value))
    }
    @Test fun deviceIdIsStableAndMethodOrderIsQrPasswordSms() {
        val store = MemoryRainStore(); val device = rainDeviceId(store)
        assertTrue(device.isNotBlank()); assertEquals(device, rainDeviceId(store)); assertEquals(listOf("扫码", "密码", "短信"), RainLoginMethod.entries.map { it.label })
    }
    @Test fun qrKeepsImageAndContentAndAllowsEitherButNeverEmpty() {
        fun qr(data: String) = rainQr(Json.parseToJsonElement("""{"code":0,"data":$data}""").jsonObject)
        assertEquals(RainQr("t", "content", "https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=fixture"), qr("""{"token":"t","qrContent":"content","qrImage":"https://mp.weixin.qq.com/cgi-bin/showqrcode?ticket=fixture"}"""))
        assertEquals("", qr("""{"token":"t","qrContent":"content"}""").image)
        assertEquals("", qr("""{"token":"t","qrImage":"https://mp.weixin.qq.com/qr"}""").content)
        assertTrue(runCatching { qr("""{"token":"t"}""") }.isFailure)
        assertTrue(runCatching { qr("""{"qrContent":"content"}""") }.isFailure)
    }
    @Test fun qrImagesOnlyLoadAnonymousHttpsOnSelectedHostOrWechat() {
        RainHost.entries.forEach { host ->
            assertTrue(rainQrImageAllowed(host, "https://${host.domain}/qr.png")); assertTrue(rainQrImageAllowed(host, "https://mp.weixin.qq.com/qr"))
            assertFalse(rainQrImageAllowed(host, "https://mp.weixin.qq.com.evil.invalid/qr")); assertFalse(rainQrImageAllowed(host, "http://mp.weixin.qq.com/qr")); assertFalse(rainQrImageAllowed(host, "https://127.0.0.1/qr")); assertFalse(rainQrImageAllowed(host, "https://mp.weixin.qq.com:444/qr")); assertFalse(rainQrImageAllowed(host, ""))
        }
    }
    @Test fun qrGraceAllowsOnlyVisibleQrForSixtySecondsInBackground() {
        assertTrue(rainQrPollingAllowed(true, true, false, 0, 1000))
        assertTrue(rainQrPollingAllowed(true, false, true, 61000, 60999))
        assertFalse(rainQrPollingAllowed(true, false, true, 61000, 61000))
        assertFalse(rainQrPollingAllowed(true, false, false, 61000, 1000))
        assertFalse(rainQrPollingAllowed(false, true, true, 61000, 1000))
    }
    @Test fun demoSupportsAllThreeMethodsWithoutAnyTransportAndReportsBadSms() = runBlocking {
        RainHost.entries.forEach { host ->
            val backend = DemoRainBackend(host)
            assertTrue(backend.poll(backend.qr())); assertEquals("1001", backend.user().id)
            backend.login(RainLoginMethod.PASSWORD, "student@example.invalid", "fixture", proof)
            backend.sendSms("13800000000", proof)
            assertTrue(runCatching { backend.login(RainLoginMethod.SMS, "13800000000", "000000", proof) }.exceptionOrNull()?.message.orEmpty().contains("123456"))
            backend.login(RainLoginMethod.SMS, "13800000000", "123456", proof)
            assertTrue(backend.writes.isEmpty())
        }
    }
    @Test fun packagedCaptchaUsesOfficialWidgetAndDarkModeWithoutCredentialInputs() {
        val html = requireNotNull(javaClass.getResourceAsStream("/rain_captcha.html")).bufferedReader().use { it.readText() }
        assertTrue(html.contains("https://turing.captcha.qcloud.com/TCaptcha.js")); assertTrue(html.contains("2091064951")); assertTrue(html.contains("enableDarkMode:__DARK__")); assertTrue(html.contains("RainCaptcha.complete(nonce")); assertFalse(html.contains("<input"))
    }
}
