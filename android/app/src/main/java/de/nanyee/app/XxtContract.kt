// Portions derived from AneryCoft/course_helper (GPL-3.0), lib/api and lib/models.
package de.nanyee.app

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import okhttp3.FormBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

internal const val XXT_MOBILE = "https://mobilelearn.chaoxing.com"
internal class XxtFailure(val kind: String, message: String) : Exception(message)
@Serializable internal data class XxtUser(val uid: String, val name: String, val cid: String = "", val sc: String = "")
@Serializable internal data class XxtCourse(val id: String, val classId: String, val cpi: String, val name: String, val teacher: String)
@Serializable internal data class XxtActivity(val id: String, val name: String, val description: String, val type: Int, val ongoing: Boolean, val start: Long, val end: Long = 0, val signType: Int = -1, val topicId: String = "")
@Serializable internal data class XxtSignDetail(val type: Int, val photo: Boolean = false, val face: Boolean = false, val captcha: Boolean = false, val address: String = "", val latitude: Double? = null, val longitude: Double? = null, val range: String = "", val codeLength: Int = 0, val signed: Boolean = false)
@Serializable internal data class XxtPosition(val latitude: Double, val longitude: Double, val obtainedAt: Long, val accuracy: Float)
@Serializable internal data class XxtSignPlan(val course: XxtCourse, val activity: XxtActivity, val detail: XxtSignDetail, val code: String = "", val qr: String = "", val photoPath: String = "", val position: XxtPosition? = null)
internal data class XxtQrLogin(val uuid: String, val enc: String, val image: ByteArray)
internal data class XxtCaptcha(val token: String, val iv: String, val stamp: Long, val background: ByteArray, val piece: ByteArray, val originalWidth: Int = 320)
internal sealed interface XxtSignResult {
    data object Success : XxtSignResult
    data class Captcha(val enc2: String = "") : XxtSignResult
    data object Unknown : XxtSignResult
    data object Rejected : XxtSignResult
}
internal fun xxtAes(value: String, key: String = "u2oh6Vu^HWe4_AES", cbc: Boolean = true): String {
    val cipher = Cipher.getInstance(if (cbc) "AES/CBC/PKCS5Padding" else "AES/ECB/PKCS5Padding")
    val secret = SecretKeySpec(key.toByteArray(StandardCharsets.UTF_8), "AES")
    if (cbc) cipher.init(Cipher.ENCRYPT_MODE, secret, IvParameterSpec(key.toByteArray(StandardCharsets.UTF_8))) else cipher.init(Cipher.ENCRYPT_MODE, secret)
    return Base64.getEncoder().encodeToString(cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8)))
}
internal fun xxtMd5(value: ByteArray) = MessageDigest.getInstance("MD5").digest(value).joinToString("") { "%02x".format(it) }
internal fun xxtMd5(value: String) = xxtMd5(value.toByteArray(StandardCharsets.UTF_8))
internal fun xxtEncode(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20").replace("%7E", "~").replace("*", "%2A")
internal fun xxtSigned(fields: Map<String, String>, device: String, now: Long): Map<String, String> {
    val values = fields + linkedMapOf("_c_0_" to device, "token" to "4faa8662c59590c6f43ae9fe5b002b42", "_time" to "$now")
    return values + ("inf_enc" to xxtMd5(values.entries.joinToString("&") { "${xxtEncode(it.key)}=${xxtEncode(it.value)}" } + "&DESKey=Z(AfY@XS"))
}
internal fun xxtRequest(url: String, fields: Map<String, String> = emptyMap(), post: Boolean = false): Request {
    val uri = url.toHttpUrl()
    require(uri.isHttps && (uri.host == "chaoxing.com" || uri.host.endsWith(".chaoxing.com")))
    val builder = Request.Builder().url(if (post) uri else uri.newBuilder().apply { fields.forEach { (k, v) -> addQueryParameter(k, v) } }.build())
        .header("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36")
    if (post) builder.post(FormBody.Builder().apply { fields.forEach { (k, v) -> add(k, v) } }.build())
    return builder.build()
}
internal fun xxtLoginRequest(account: String, password: String) = xxtRequest("https://passport2.chaoxing.com/fanyalogin", linkedMapOf("fid" to "-1", "uname" to xxtAes(account), "password" to xxtAes(password), "t" to "true", "forbidotherlogin" to "0", "validate" to ""), true)
internal fun xxtCourses(json: JsonObject): List<XxtCourse> {
    if (json["result"]?.jsonPrimitive?.intOrNull != 1) throw XxtFailure("SESSION", "学习通会话已过期，请重新登录。")
    return (json["channelList"] as? JsonArray ?: throw XxtFailure("FORMAT", "学习通课程格式有变。 ")).mapNotNull { item ->
        val content = item.jsonObject["content"]?.jsonObject ?: return@mapNotNull null
        val data = content["course"]?.jsonObject?.get("data")?.jsonArray?.firstOrNull()?.jsonObject ?: return@mapNotNull null
        if (content.number("state") != 0) return@mapNotNull null
        XxtCourse(data.text("id"), content.text("id"), content.text("cpi"), data.text("name"), data.text("teacherfactor"))
    }
}
internal fun xxtActivities(app: JsonObject, web: JsonObject): List<XxtActivity> {
    val rows = app["activeList"] as? JsonArray ?: throw XxtFailure("FORMAT", "学习通活动格式有变。")
    val other = (web["data"] as? JsonObject)?.get("activeList") as? JsonArray ?: throw XxtFailure("FORMAT", "学习通活动格式有变。")
    val types = other.associate { it.jsonObject.text("id") to it.jsonObject }
    return rows.map { item -> val row = item.jsonObject; val extra = types[row.text("id")]
        XxtActivity(row.text("id"), row.text("nameOne"), row.text("nameTwo").ifBlank { extra?.text("nameFour").orEmpty() }, row.number("activeType"), row.number("status") == 1, row.text("startTime").toLongOrNull() ?: 0, row.text("endTime").toLongOrNull() ?: 0, extra?.text("otherId")?.toIntOrNull() ?: -1, (row["extraInfo"] as? JsonObject)?.text("topicId").orEmpty())
    }.sortedWith(compareByDescending<XxtActivity> { it.ongoing }.thenByDescending { it.start })
}
internal fun xxtDetail(data: JsonObject, attend: JsonObject): XxtSignDetail {
    fun coordinate(vararg keys: String): Double? = keys.firstNotNullOfOrNull { data.text(it).toDoubleOrNull() }
    return XxtSignDetail(data.text("otherId").toIntOrNull() ?: -1, data.number("ifphoto") == 1, data.number("openCheckFaceFlag") == 1, data.number("showVCode") == 1, data.text("locationText"), coordinate("locationLatitude", "latitude"), coordinate("locationLongitude", "longitude"), data.text("locationRange"), data.number("numberCount"), attend.number("status") in setOf(1, 2))
}
internal fun xxtValidate(plan: XxtSignPlan, now: Long) {
    require(plan.activity.ongoing && plan.activity.type in setOf(2, 74)) { "活动不可签到。" }
    require(!plan.detail.face) { "不支持人脸签到，请使用官方学习通。" }
    require(!plan.detail.signed) { "当前账号已签到。" }
    require(plan.detail.type in setOf(0, 2, 3, 4, 5)) { "不支持此签到类型。" }
    require(plan.activity.end == 0L || plan.activity.end > now) { "活动已结束。" }
    if (plan.detail.photo) require(plan.photoPath.isNotBlank()) { "请拍照或选择照片。" }
    if (plan.detail.type in setOf(3, 5)) require(plan.code.matches(Regex("[0-9]{1,20}")) && (plan.detail.codeLength == 0 || plan.code.length == plan.detail.codeLength)) { "请完成手势或填写签到码。" }
    if (plan.detail.type == 2) xxtQrEnc(plan.qr, plan.activity.id)
    if (plan.detail.type == 4 || (plan.detail.type in setOf(2, 3, 5) && plan.detail.address.isNotBlank())) require(plan.position != null && now - plan.position.obtainedAt in 0..120000 && plan.position.accuracy in 0f..100f && plan.position.latitude in -90.0..90.0 && plan.position.longitude in -180.0..180.0) { "请重新获取准确的真实定位（两分钟内，误差不超过 100 米）。" }
}
internal fun xxtQrEnc(raw: String, activity: String): String {
    val url = raw.toHttpUrl()
    require(url.isHttps && url.host == "mobilelearn.chaoxing.com" && url.encodedPath == "/widget/sign/e" && url.queryParameter("id") == activity) { "二维码不属于当前签到活动。" }
    return requireNotNull(url.queryParameter("enc")).also { require(it.isNotBlank() && it.length <= 1024) }
}
internal fun xxtSignFields(user: XxtUser, plan: XxtSignPlan, device: String, now: Long, objectId: String = "", validate: String = "", enc2: String = ""): Map<String, String> {
    xxtValidate(plan, now)
    val fields = linkedMapOf("activeId" to plan.activity.id, "courseId" to plan.course.id, "uid" to user.uid, "name" to user.name, "clientip" to "", "latitude" to "-1", "longitude" to "-1", "appType" to "15", "fid" to "0", "deviceCode" to device)
    if (plan.detail.photo) { require(objectId.isNotBlank()); fields["objectId"] = objectId }
    if (plan.detail.type in setOf(3, 5)) fields["signCode"] = plan.code
    if (plan.detail.type == 2) fields["enc"] = xxtQrEnc(plan.qr, plan.activity.id)
    if (validate.isNotBlank()) { fields["validate"] = validate; if (enc2.isNotBlank()) fields["enc2"] = enc2 }
    plan.position?.let { position ->
        fields["latitude"] = position.latitude.toString(); fields["longitude"] = position.longitude.toString()
        fields["address"] = plan.detail.address.ifBlank { "当前位置" }; fields["ifTiJiao"] = "1"
        val data = buildJsonObject { put("latitude", position.latitude); put("longitude", position.longitude); put("address", fields["address"]) }.toString()
        val stamp = "$now"
        val token = xxtMd5("cxcid${user.cid}cxtime${stamp}data${data}${user.sc}")
        fields["locationResult"] = buildJsonObject { put("result", 1); put("latitude", position.latitude); put("longitude", position.longitude); put("address", fields["address"]); put("signConfig", buildJsonObject { put("signToken", token); put("cxcid", user.cid); put("cxtime", stamp) }) }.toString()
        if (plan.detail.type == 2) fields["location"] = buildJsonObject { put("result", 1); put("address", fields["address"]); put("latitude", position.latitude); put("longitude", position.longitude) }.toString()
    }
    return fields
}
internal fun xxtSignResult(text: String): XxtSignResult = when {
    text.trim() == "success" -> XxtSignResult.Success
    text.trim().startsWith("validate") -> XxtSignResult.Captcha(text.trim().substringAfter('_', ""))
    text.trim().startsWith("<") -> XxtSignResult.Unknown
    else -> XxtSignResult.Rejected
}
internal interface XxtListing {
    suspend fun login(account: String, password: String): XxtUser
    suspend fun user(): XxtUser
    suspend fun courses(): List<XxtCourse>
    suspend fun activities(course: XxtCourse): List<XxtActivity>
}
internal interface XxtBackend : XxtListing, XxtClassroomBackend {
    suspend fun qrLogin(): XxtQrLogin
    suspend fun pollQr(qr: XxtQrLogin): XxtUser?
    suspend fun detail(activity: XxtActivity): XxtSignDetail
    suspend fun sign(user: XxtUser, plan: XxtSignPlan, validate: String = "", enc2: String = ""): XxtSignResult
    suspend fun captcha(plan: XxtSignPlan): XxtCaptcha
    suspend fun solveCaptcha(challenge: XxtCaptcha, x: Int, plan: XxtSignPlan): String
    suspend fun clear()
}
