package de.nanyee.app

import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import okhttp3.FormBody
import okhttp3.Request
import org.junit.Assert.*
import org.junit.Test
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec

class ClassroomLoginTest {
    private fun fields(request: Request): Map<String, String> = (request.body as FormBody).let { body -> (0 until body.size).associate { body.name(it) to body.value(it) } }
    private fun decodeLogin(request: Request): JsonObject {
        val cipher = Cipher.getInstance("AES/ECB/PKCS5Padding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec("z4ok6lu^oWp4_AES".toByteArray(), "AES"))
        return Json.parseToJsonElement(cipher.doFinal(Base64.getDecoder().decode(fields(request).getValue("logininfo"))).toString(Charsets.UTF_8)).jsonObject
    }
    @Test fun nativeSchildAndDeviceProfileMatchReference() {
        assertEquals("Dalvik/2.1.0 (Linux; U; Android 16; Pixel 9 Pro Build/BP4A.260205.002) (schild:6f1b9e0f1f68f243dc847cbb8f844312) (device:Pixel 9 Pro) Language/zh_CN com.chaoxing.mobile/ChaoXingStudy_3_6.7.4_android_phone_10940_314 (@Kalimdor)_fixture-device", xxtUserAgent("fixture-device"))
        val profile = xxtDeviceProfile("fixture-device", 1700000000123)
        assertEquals(Json.parseToJsonElement("""{"app_name":"com.chaoxing.mobile","app_ver":"6.7.4","board":"caiman","brand":"google","cdid":"fixture-device","cdtype":"Pixel 9 Pro","cpu_ar":"arm64-v8a,armeabi-v7a,armeabi","device_id":"fixture-device","dpi":"440","hardware":"caiman","mediaDrmId":"","oaid":"1004","os_lang":"","os_name":"REL","os_ver":"16","platform":"android","resolution":"1080*2243","time_stamp":1700000000123}"""), profile)
        assertEquals("zh_CN", xxtLoginRequest("student", "secret", device = "fixture-device").header("Accept-Language"))
        assertNotEquals(xxtUserAgent("one"), xxtUserAgent("two"))
    }
    @Test fun ecbPreservesUnicodeQuotesAndEmptyInputsWithoutAddingWebLoginFields() {
        for ((account, code) in listOf("学习通\"账号" to "p\\a\"ss", "" to "")) {
            val request = xxtLoginRequest(account, code)
            assertEquals(buildJsonObject { put("uname", account); put("code", code) }, decodeLogin(request))
        }
    }
    @Test fun smsEncAndLoginTypeMatchReference() {
        val request = xxtSmsRequest("13800000000", 1700000000123)
        assertEquals("POST", request.method); assertEquals("https://passport2-api.chaoxing.com/api/sendcaptcha", request.url.toString())
        assertEquals(mapOf("to" to "13800000000", "countrycode" to "86", "time" to "1700000000123", "enc" to "37f58f6bd4126cb23684195e2209cadf"), fields(request))
        val login = xxtLoginRequest("13800000000", "123456", sms = true)
        assertEquals("2", fields(login)["loginType"]); assertEquals("86", fields(login)["countrycode"])
        assertEquals(buildJsonObject { put("uname", "13800000000"); put("code", "123456") }, decodeLogin(login))
        assertThrows(IllegalArgumentException::class.java) { xxtSmsRequest("", 0) }
        assertThrows(IllegalArgumentException::class.java) { xxtSmsRequest("not-a-phone", 0) }
    }
    @Test fun loginMesIsDisplayedWithEmptyFallback() {
        assertEquals("账号或密码错误", assertThrows(XxtFailure::class.java) { xxtLoginStatus(buildJsonObject { put("status", false); put("mes", "账号或密码错误") }) }.message)
        assertFalse(assertThrows(XxtFailure::class.java) { xxtLoginStatus(buildJsonObject { put("status", false); put("mes", "") }) }.message.isNullOrBlank())
        xxtLoginStatus(buildJsonObject { put("status", true) })
    }
    @Test fun smsCooldownSurvivesRecreationAndExpiresAtDeadline() {
        assertEquals(60, classroomSmsResendSeconds(61000, 1000))
        assertEquals(1, classroomSmsResendSeconds(61000, 60999))
        assertEquals(0, classroomSmsResendSeconds(61000, 61000))
        assertEquals(0, classroomSmsResendSeconds(61000, 62000))
        assertEquals(0, classroomSmsResendSeconds(0, 62000))
    }
    @Test fun rainDeviceHeadersMatchReference() {
        val request = rainRequest(RainHost.CHANGJIANG, "/api/v3/user/login/pre-info")
        mapOf("brand" to "google Pixel 9 Pro", "uuid" to "", "buildnumber" to "1610", "systemversion" to "16", "incremental" to "14624737", "isphysicaldevice" to "true").forEach { (name, value) -> assertEquals(value, request.header(name)) }
    }
    @Test fun qrWaitsThenRefreshesExpiredAndStopsAfterAuthorization() = runBlocking {
        var polls = 0; var pauses = 0; var refreshes = 0
        val shown = mutableListOf<String>()
        val result = renewingClassroomQr("old", refresh = { refreshes++; "new" }, show = { shown.add(it) }, pause = { pauses++ }) { qr ->
            polls++
            when (polls) { 1 -> ClassroomQrResult.Waiting; 2 -> ClassroomQrResult.Expired; else -> ClassroomQrResult.Authorized(qr) }
        }
        assertEquals("new", result); assertEquals(1, refreshes); assertEquals(3, pauses); assertEquals(listOf("old", "new"), shown)
        assertEquals(3000L, CLASSROOM_QR_POLL_MILLIS)
    }
    @Test fun qrBudgetExhaustionAndRainTimeoutBothRenew() = runBlocking {
        for (expired in listOf(false, true)) {
            var polls = 0; var refreshed = false
            val result = renewingClassroomQr("old", refresh = { refreshed = true; "new" }, show = {}, attempts = 2, pause = {}) { qr ->
                polls++
                if (qr == "new") ClassroomQrResult.Authorized("本人") else if (expired) ClassroomQrResult.Expired else ClassroomQrResult.Waiting
            }
            assertTrue(refreshed); assertEquals("本人", result); assertEquals(if (expired) 2 else 3, polls)
        }
    }
    @Test fun qrCancellationStopsPollAndRefreshWhileFailuresDoNotLoop() = runBlocking {
        var refreshed = 0; var polled = 0
        val started = CompletableDeferred<Unit>()
        val job = launch(start = CoroutineStart.UNDISPATCHED) {
            renewingClassroomQr<String, Unit>("old", refresh = { refreshed++; "new" }, show = {}, pause = {}) {
                polled++; started.complete(Unit); awaitCancellation()
            }
        }
        started.await(); job.cancelAndJoin()
        assertEquals(0, refreshed); assertEquals(1, polled)
        assertEquals("NETWORK", (runCatching { renewingClassroomQr<String, Unit>("old", refresh = { refreshed++; "new" }, show = {}, pause = {}) { throw XxtFailure("NETWORK", "离线") } }.exceptionOrNull() as XxtFailure).kind)
        assertEquals(0, refreshed)
    }
    @Test fun demoSmsIsOfflineAndIncludesSuccessAndFailure() = runBlocking {
        val backend = DemoXxtBackend()
        backend.sendSms("13800000000")
        assertEquals(backend.user(), backend.loginSms("13800000000", "123456"))
        assertEquals("LOGIN", (runCatching { backend.loginSms("13800000000", "000000") }.exceptionOrNull() as XxtFailure).kind)
        assertTrue(runCatching { backend.sendSms("") }.exceptionOrNull() is IllegalArgumentException)
        assertTrue(runCatching { backend.loginSms("", "123456") }.exceptionOrNull() is IllegalArgumentException)
    }
}
