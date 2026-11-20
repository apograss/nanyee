package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Timeout
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.util.Base64

internal class MemoryXxtStorage : XxtStorage {
    val values = mutableMapOf<String, String>()
    override fun read(key: String) = values[key].orEmpty()
    override fun write(key: String, value: String) { values[key] = value }
    override fun clear() { values.clear() }
}
class XxtTest {
    @Test fun locationTimeoutDistinguishesMockFromMissingFixes() {
        assertEquals("检测到模拟定位，请关闭模拟定位后重试", xxtLocationTimeout(true).message)
        assertEquals("定位超时，请到室外或打开 GPS 后重试", xxtLocationTimeout(false).message)
    }

    @Test fun photoConfirmationSeparatesDemoFromRealUpload() {
        assertEquals("演示模式：仅模拟照片签到，不会上传照片或提交真实签到。", xxtPhotoConfirmation(true))
        assertFalse(xxtPhotoConfirmation(true).contains("pan-yz"))
        assertEquals("将向超星 pan-yz 上传上方预览照片，然后提交签到。", xxtPhotoConfirmation(false))
    }

    private val course = XxtCourse("101", "201", "301", "示例课程", "示例老师")
    private val activity = XxtActivity("402", "课堂签到", "", 2, true, 1000)
    private val owner = XxtUser("12345", "示例本人", "device-cid", "device-sc")
    private val now = 1700001000000L
    private fun plan(type: Int = 0) = XxtSignPlan(course, activity, XxtSignDetail(type))
    private fun fixture(name: String) = javaClass.classLoader!!.getResourceAsStream("xuexitong/$name.json")!!.use { Json.parseToJsonElement(it.bufferedReader().readText()).jsonObject }

    @Test fun encryptionMatchesIndependentOpenSslVectorsAndEmptyPadding() {
        assertEquals("iX1+cDcgXWbkvMo7rBczPQ==", xxtAes("student"))
        assertEquals("LXYPGIOJyFUvuG1SPO0nVQ==", xxtAes(""))
        assertEquals("900150983cd24fb0d6963f7d28e17f72", xxtMd5("abc"))
        assertEquals(16, Base64.getDecoder().decode(xxtAes("学习通")).size)
        assertThrows(Exception::class.java) { xxtAes("test", "short") }
    }
    @Test fun rsaUsesPublicKeyAndChunksLongProfile() {
        assertEquals(128, Base64.getDecoder().decode(xxtRsa("profile")).size)
        assertEquals(384, Base64.getDecoder().decode(xxtRsa("a".repeat(300))).size)
        assertThrows(Exception::class.java) { xxtRsa("not-base64", true) }
    }
    @Test fun passwordRequestUsesNativeAppEcbLoginInfo() {
        val request = xxtLoginRequest("student", "password123")
        assertEquals("POST", request.method); assertEquals("passport2-api.chaoxing.com", request.url.host)
        assertEquals("/v11/loginregister", request.url.encodedPath); assertEquals("json", request.url.queryParameter("cx_xxt_passport"))
        val body = request.body as FormBody
        val fields = (0 until body.size).associate { body.name(it) to body.value(it) }
        assertEquals(mapOf("logininfo" to "IV+A4oy65pZSZvDzU1GZ5tZyjuAgEmu8VRjNJgvrVwSHIEi7r85mE+qfIADeymnD", "loginType" to "1", "roleSelect" to "true", "entype" to "1"), fields)
    }
    @Test fun signedQueriesPreserveSourceOrderAndUriEscaping() {
        val fields = linkedMapOf("courseId" to "101", "classId" to "201", "uid" to "12345", "cpi" to "301", "joinclasstime" to "a b&中")
        val signed = xxtSigned(fields, "fixture-device", 123)
        assertEquals("a%20b%26%E4%B8%AD", xxtEncode("a b&中"))
        val serialized = (signed - "inf_enc").entries.joinToString("&") { "${xxtEncode(it.key)}=${xxtEncode(it.value)}" }
        assertEquals(xxtMd5("$serialized&DESKey=Z(AfY@XS"), signed["inf_enc"])
        assertEquals(fields["joinclasstime"], signed["joinclasstime"])
        assertThrows(IllegalArgumentException::class.java) { xxtRequest("https://chaoxing.com.evil.test/upload") }
        assertThrows(IllegalArgumentException::class.java) { xxtRequest("http://mobilelearn.chaoxing.com/test") }
    }
    @Test fun courseFixtureFiltersArchivedAndNonCourseChannels() {
        assertEquals(listOf(course), xxtCourses(fixture("courses")))
        assertTrue(xxtCourses(Json.parseToJsonElement("""{"result":1,"channelList":[]}""").jsonObject).isEmpty())
        assertThrows(XxtFailure::class.java) { xxtCourses(Json.parseToJsonElement("""{"result":0}""").jsonObject) }
        assertThrows(XxtFailure::class.java) { xxtCourses(Json.parseToJsonElement("""{"result":1}""").jsonObject) }
    }
    @Test fun activitiesMergeTypesDescriptionsAndSortOngoingFirst() {
        val rows = xxtActivities(fixture("activities-app"), fixture("activities-web"))
        assertEquals(listOf("403", "402", "401"), rows.map { it.id })
        assertEquals(3, rows[1].signType); assertEquals("手势活动", rows[1].description)
        assertEquals(1700001000000, rows[1].start)
        assertFalse(rows.last().ongoing)
        assertTrue(xxtActivities(Json.parseToJsonElement("""{"activeList":[]}""").jsonObject, Json.parseToJsonElement("""{"data":{"activeList":[]}}""").jsonObject).isEmpty())
        assertThrows(XxtFailure::class.java) { xxtActivities(buildJsonObject {}, buildJsonObject {}) }
    }
    @Test fun detailExposesCaptchaFaceAndCoordinates() {
        val detail = xxtDetail(fixture("detail")["data"]!!.jsonObject, payload("status" to "0"))
        assertEquals(4, detail.type); assertTrue(detail.captcha); assertFalse(detail.face)
        assertEquals(23.1134, detail.latitude!!, 0.00001)
        assertTrue(xxtDetail(payload("otherId" to "4", "openCheckFaceFlag" to "1"), payload("status" to "1")).face)
        assertTrue(xxtDetail(payload("otherId" to "0"), payload("status" to "1")).signed)
        assertEquals(-1, xxtDetail(buildJsonObject {}, buildJsonObject {}).type)
    }
    @Test fun allSignFieldsAreBoundToTheCurrentUser() {
        val ordinary = xxtSignFields(owner, plan(), "device", now)
        assertEquals("12345", ordinary["uid"]); assertEquals("示例本人", ordinary["name"])
        assertEquals("402", ordinary["activeId"]); assertEquals("101", ordinary["courseId"])
        assertEquals("-1", ordinary["latitude"]); assertFalse(ordinary.containsKey("validate"))
        val photo = plan().copy(detail = XxtSignDetail(0, photo = true), photoPath = "local-private-image.jpg")
        assertEquals("image-object", xxtSignFields(owner, photo, "device", now, objectId = "image-object")["objectId"])
        assertThrows(IllegalArgumentException::class.java) { xxtSignFields(owner, photo, "device", now) }
        for (type in listOf(3, 5)) assertEquals("1234", xxtSignFields(owner, plan(type).copy(code = "1234"), "device", now)["signCode"])
        val qr = plan(2).copy(qr = "https://mobilelearn.chaoxing.com/widget/sign/e?id=402&enc=scan-token")
        val qrFields = xxtSignFields(owner, qr, "device", now, validate = "manual-validation", enc2 = "fixed-enc")
        assertEquals("scan-token", qrFields["enc"]); assertEquals("fixed-enc", qrFields["enc2"])
        assertFalse(qrFields.containsKey("currentFaceId")); assertFalse(qrFields.containsKey("ifCFP"))
    }
    @Test fun locationFieldsContainRealFreshPositionAndNoFakedProviderOrProbability() {
        val value = plan(4).copy(detail = XxtSignDetail(4, address = "教学楼"), position = XxtPosition(23.1134, 113.3311, now - 1000, 12f))
        val fields = xxtSignFields(owner, value, "device", now)
        assertEquals("23.1134", fields["latitude"])
        val location = Json.parseToJsonElement(fields.getValue("locationResult")).jsonObject
        assertFalse(location.containsKey("mockData")); assertFalse(location.containsKey("locType")); assertFalse(fields.containsKey("vpProbability"))
        assertEquals("device-cid", location["signConfig"]!!.jsonObject.text("cxcid"))
        val stale = value.copy(position = value.position!!.copy(obtainedAt = now - 120001))
        assertThrows(IllegalArgumentException::class.java) { xxtValidate(stale, now) }
        assertThrows(IllegalArgumentException::class.java) { xxtValidate(value.copy(position = value.position!!.copy(accuracy = 101f)), now) }
        assertThrows(IllegalArgumentException::class.java) { xxtValidate(plan(4), now) }
        assertThrows(IllegalArgumentException::class.java) { xxtValidate(plan(2).copy(qr = "https://mobilelearn.chaoxing.com/widget/sign/e?id=402&enc=x", detail = XxtSignDetail(2, address = "需要定位")), now) }
    }
    @Test fun malformedAndOtherActivityQrCannotBeUsed() {
        listOf("", "not-a-url", "https://evil.test/widget/sign/e?id=402&enc=x", "https://mobilelearn.chaoxing.com/widget/sign/e?id=403&enc=x", "https://mobilelearn.chaoxing.com/widget/sign/e?id=402").forEach { raw -> assertThrows(IllegalArgumentException::class.java) { xxtQrEnc(raw, "402") } }
    }
    @Test fun faceEndedSignedAndFutureLocationsAreRejectedBeforeConfirmation() {
        listOf(plan().copy(detail = XxtSignDetail(4, face = true)), plan().copy(activity = activity.copy(ongoing = false)), plan().copy(activity = activity.copy(type = 43)), plan().copy(detail = XxtSignDetail(0, signed = true)), plan().copy(detail = XxtSignDetail(-1)), plan(5).copy(code = ""), plan(5).copy(detail = XxtSignDetail(5, codeLength = 4), code = "123"), plan(4).copy(position = XxtPosition(23.0, 113.0, now + 1, 1f))).forEach { value -> assertThrows(IllegalArgumentException::class.java) { xxtValidate(value, now) } }
    }
    @Test fun responseClassificationDoesNotMistakeMessagesForSuccess() {
        assertEquals(XxtSignResult.Success, xxtSignResult("success"))
        assertEquals(XxtSignResult.Captcha("enc_value"), xxtSignResult("validate_enc_value"))
        assertEquals(XxtSignResult.Rejected, xxtSignResult("签到已结束"))
        assertEquals(XxtSignResult.Unknown, xxtSignResult("<html>login</html>"))
        assertEquals(XxtSignResult.Rejected, xxtSignResult(""))
    }
    @Test fun stateMachineNeedsConfirmationAndNeverRetriesUnknown() {
        val flow = XxtFlow()
        assertThrows(IllegalStateException::class.java) { flow.begin(now) }
        flow.preview(plan(), now); assertEquals(XxtStage.CONFIRM, flow.stage)
        assertEquals(plan(), flow.begin(now)); flow.finish(XxtSignResult.Unknown)
        assertEquals(XxtStage.UNKNOWN, flow.stage)
        assertThrows(IllegalStateException::class.java) { flow.begin(now) }
        assertThrows(IllegalStateException::class.java) { flow.preview(plan(), now) }
    }
    @Test fun captchaIsManualAndReturnsToASecondExplicitConfirmation() {
        val flow = XxtFlow(); val value = plan().copy(detail = XxtSignDetail(0, captcha = true))
        flow.preview(value, now); assertEquals(XxtStage.CAPTCHA, flow.stage)
        assertThrows(IllegalStateException::class.java) { flow.begin(now) }
        flow.verified("human-validate"); assertEquals(XxtStage.CONFIRM, flow.stage)
        flow.begin(now); flow.finish(XxtSignResult.Success); assertEquals(XxtStage.SUCCESS, flow.stage)
        assertThrows(IllegalStateException::class.java) { flow.begin(now) }
    }
    @Test fun qrCaptchaEncIsRetainedButCannotBypassConfirmation() {
        val flow = XxtFlow(); val value = plan(2).copy(qr = "https://mobilelearn.chaoxing.com/widget/sign/e?id=402&enc=token")
        flow.preview(value, now); flow.begin(now); flow.finish(XxtSignResult.Captcha("enc2"))
        assertEquals("enc2", flow.enc2); assertEquals(XxtStage.CAPTCHA, flow.stage)
        flow.verified("manual"); assertEquals(XxtStage.CONFIRM, flow.stage)
        flow.begin(now); flow.finish(XxtSignResult.Rejected)
        flow.preview(value, now); assertEquals(XxtStage.CONFIRM, flow.stage)
        flow.dismiss(); assertNull(flow.plan); assertEquals("", flow.validate)
    }
    @Test fun editedInputAndExpiredLocationNeedRevalidation() {
        val flow = XxtFlow(); val value = plan(4).copy(position = XxtPosition(23.0, 113.0, now, 10f))
        flow.preview(value, now)
        assertThrows(IllegalArgumentException::class.java) { flow.begin(now + 120001) }
        assertEquals(XxtStage.CONFIRM, flow.stage)
        flow.dismiss(); assertEquals(XxtStage.EDIT, flow.stage)
    }
    @Test fun encryptedJournalPayloadNeverContainsReplayCredentialsOrLocation() {
        val journal = XxtJournal(course = course, activity = activity, detail = XxtSignDetail(5), code = "1234", writePending = true)
        val encoded = Json.encodeToString(journal)
        assertEquals(journal, Json.decodeFromString<XxtJournal>(encoded))
        assertFalse(encoded.contains("password")); assertFalse(encoded.contains("validate")); assertFalse(encoded.contains("position"))
        assertTrue(Json.decodeFromString<XxtJournal>(encoded).writePending)
    }
    @Test fun cookieRoundTripPreservesHostOnlyPathSecureAndExpiry() {
        val storage = MemoryXxtStorage(); val jar = XxtCookies(storage)
        val origin = "https://passport2.chaoxing.com/".toHttpUrl()
        val host = Cookie.Builder().name("session").value("fixture").hostOnlyDomain(origin.host).secure().httpOnly().path("/").build()
        val domain = Cookie.Builder().name("UID").value("12345").domain("chaoxing.com").path("/").secure().expiresAt(System.currentTimeMillis() + 60000).build()
        jar.saveFromResponse(origin, listOf(host, domain))
        val restored = XxtCookies(storage)
        assertEquals(2, restored.loadForRequest(origin).size)
        assertEquals(listOf("UID"), restored.loadForRequest("https://mooc1-api.chaoxing.com/".toHttpUrl()).map { it.name })
        assertTrue(restored.loadForRequest("http://passport2.chaoxing.com/".toHttpUrl()).isEmpty())
        assertTrue(restored.loadForRequest("https://zhjw.smu.edu.cn/".toHttpUrl()).isEmpty())
        assertTrue(restored.loadForRequest(origin).first { it.name == "session" }.hostOnly)
        jar.disable(); jar.saveFromResponse(origin, listOf(host)); assertTrue(jar.loadForRequest(origin).isEmpty())
    }
    @Test fun expiredAndForeignCookiesDoNotSurvive() {
        val storage = MemoryXxtStorage(); val jar = XxtCookies(storage)
        val url = "https://mobilelearn.chaoxing.com/".toHttpUrl()
        jar.saveFromResponse(url, listOf(Cookie.Builder().name("old").value("x").domain(url.host).expiresAt(1).build()))
        assertTrue(jar.loadForRequest(url).isEmpty())
        jar.saveFromResponse("https://nanyee.de/".toHttpUrl(), listOf(Cookie.Builder().name("foreign").value("x").domain("nanyee.de").build()))
        assertTrue(jar.loadForRequest(url).isEmpty())
    }
    @Test fun bd09ConversionAndDistanceHaveKnownValues() {
        val (lat, lon) = xxtBd09(39.908823, 116.397470)
        assertEquals(39.916566, lat, 0.00002); assertEquals(116.410086, lon, 0.00002)
        assertEquals(51.5 to -0.12, xxtBd09(51.5, -0.12))
        assertEquals(0, xxtDistance(XxtPosition(lat, lon, now, 10f), lat, lon))
        assertTrue(xxtDistance(XxtPosition(23.0, 113.0, now, 10f), 23.001, 113.0) in 110..112)
    }
    @Test fun gestureEntryAddsCrossedMiddlePointsAndCannotRepeat() {
        assertEquals("123", xxtPatternAppend("1", 3)); assertEquals("159", xxtPatternAppend("1", 9))
        assertEquals("123", xxtPatternAppend("123", 1)); assertEquals("258", xxtPatternAppend("2", 8))
        assertThrows(IllegalArgumentException::class.java) { xxtPatternAppend("", 0) }
    }
    @Test fun demoIncludesAllTypesAndSuccessFailureUnknownWithoutTransport() = runBlocking {
        val demo = DemoXxtBackend(); val user = demo.user(); val c = demo.courses().single(); val rows = demo.activities(c)
        val details = rows.filter { it.ongoing && it.type in setOf(2, 74) }.map { demo.detail(it) }
        assertEquals(setOf(0, 2, 3, 4, 5), details.map { it.type }.toSet()); assertTrue(details.any { it.face }); assertTrue(details.any { it.photo }); assertTrue(details.any { it.captcha })
        assertEquals(XxtSignResult.Success, demo.sign(user, XxtSignPlan(c, rows[0], details[0])))
        assertEquals(XxtSignResult.Rejected, demo.sign(user, XxtSignPlan(c, rows[7], details[7])))
        assertEquals(XxtSignResult.Unknown, demo.sign(user, XxtSignPlan(c, rows[8], details[8])))
        val captchaPlan = XxtSignPlan(c, rows[9], details[9]); val challenge = demo.captcha(captchaPlan)
        assertEquals("manual-demo", demo.solveCaptcha(challenge, 125, captchaPlan))
        assertEquals(XxtSignResult.Success, demo.sign(user, captchaPlan, "manual-demo"))
        assertThrows(IllegalArgumentException::class.java) { runBlocking { demo.sign(user.copy(uid = "other"), XxtSignPlan(c, rows[0], details[0])) } }
        Unit
    }
}
