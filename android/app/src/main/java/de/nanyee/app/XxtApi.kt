// Portions derived from AneryCoft/course_helper (GPL-3.0), lib/api/{login,course,sign_in,image,captcha}.dart.
package de.nanyee.app

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.io.File
import java.io.IOException
import java.security.KeyFactory
import java.security.spec.X509EncodedKeySpec
import java.util.Base64
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher

internal interface XxtStorage { fun read(key: String): String; fun write(key: String, value: String); fun clear() }
internal class EncryptedXxtStorage(context: Context) : XxtStorage {
    private val prefs = EncryptedSharedPreferences.create(context, "xuexitong_private", MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(), EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV, EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM)
    override fun read(key: String) = prefs.getString(key, "").orEmpty()
    override fun write(key: String, value: String) { if (!prefs.edit().putString(key, value).commit()) throw XxtFailure("STORAGE", "无法安全保存学习通状态。") }
    override fun clear() { if (!prefs.edit().clear().commit()) throw XxtFailure("STORAGE", "无法清除学习通数据，请重试或在系统设置清除应用数据。") }
}
internal class XxtCookies(private val storage: XxtStorage) : CookieJar {
    private val values = mutableListOf<Pair<String, Cookie>>()
    private var enabled = true
    init { storage.read("cookies").lineSequence().forEach { line ->
        val origin = line.substringBefore('\t'); val url = origin.toHttpUrlOrNullSafe()
        if (url != null && xxtHost(url)) Cookie.parse(url, line.substringAfter('\t', ""))?.let { values.add(origin to it) }
    } }
    @Synchronized override fun loadForRequest(url: HttpUrl): List<Cookie> = if (!enabled || !xxtHost(url)) emptyList() else values.map { it.second }.filter { it.matches(url) && it.expiresAt > System.currentTimeMillis() }
    @Synchronized override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        if (!enabled || !xxtHost(url)) return
        cookies.forEach { next ->
            if (next.domain != "chaoxing.com" && !next.domain.endsWith(".chaoxing.com")) return@forEach
            values.removeAll { (_, old) -> old.name == next.name && old.domain == next.domain && old.path == next.path }
            if (next.expiresAt > System.currentTimeMillis()) values.add("https://${url.host}/" to next)
        }
        try { storage.write("cookies", values.joinToString("\n") { (origin, cookie) -> "$origin\t${if (cookie.hostOnly) cookie.toString().replace("; domain=${cookie.domain}", "") else cookie.toString()}" }) }
        catch (e: Exception) { values.clear(); throw e }
    }
    @Synchronized fun disable() { enabled = false; values.clear() }
}
private fun String.toHttpUrlOrNullSafe() = runCatching { toHttpUrl() }.getOrNull()
private fun xxtHost(url: HttpUrl) = url.isHttps && (url.host == "chaoxing.com" || url.host.endsWith(".chaoxing.com"))
internal class XxtApi(private val storage: XxtStorage, private val transport: Call.Factory? = null, private val readOnly: Boolean = false) : XxtBackend {
    private val jar = XxtCookies(storage)
    private val client = OkHttpClient.Builder().cookieJar(jar).retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).callTimeout(30, TimeUnit.SECONDS).build()
    private val device = storage.read("device").ifBlank { UUID.randomUUID().toString().replace("-", "").also { storage.write("device", it) } }
    private var retryAt = 0L
    private suspend fun raw(request: Request, bytes: Boolean = false): ByteArray = withContext(Dispatchers.IO) {
        require(xxtHost(request.url))
        if (readOnly) require(request.url.encodedPath in setOf("/fanyalogin", "/apis/login/userLogin4Uname.do", "/mycourse/backclazzdata", "/gas/clazzperson", "/ppt/activeAPI/taskactivelist", "/v2/apis/active/student/activelist")) { "Read-only 学习通 test blocked endpoint." }
        if (System.currentTimeMillis() < retryAt) throw XxtFailure("RATE", "学习通限流，请等待后重试。")
        try {
            (transport ?: client).newCall(request).awaitResult { response ->
                if (response.code == 429) { retryAt = platformRetryAt(response.header("Retry-After"), System.currentTimeMillis()); throw XxtFailure("RATE", "学习通限流，请稍后再试。") }
                if (response.code in setOf(401, 403) || response.isRedirect) throw XxtFailure("SESSION", "学习通会话已过期，请重新登录。")
                if (!response.isSuccessful) throw XxtFailure("UPSTREAM", "学习通响应异常，请稍后重试。")
                val limit = if (bytes) 8 * 1024 * 1024L else 4 * 1024 * 1024L
                val source = response.body?.source() ?: throw XxtFailure("FORMAT", "学习通响应为空。")
                source.request(limit + 1)
                if (source.buffer.size > limit) throw XxtFailure("FORMAT", "学习通响应过大。")
                source.readByteArray()
            }
        } catch (_: IOException) { throw XxtFailure("NETWORK", "无法连接学习通，请检查网络。") }
    }
    private suspend fun json(request: Request): JsonObject {
        val text = raw(request).toString(Charsets.UTF_8)
        if (text.trimStart().startsWith("<")) throw XxtFailure("SESSION", "学习通会话已过期，请重新登录。")
        return runCatching { Json.parseToJsonElement(text).jsonObject }.getOrElse { throw XxtFailure("FORMAT", "学习通响应格式有变。") }
    }
    override suspend fun login(account: String, password: String): XxtUser {
        val response = json(xxtLoginRequest(account, password))
        if (response["status"]?.jsonPrimitive?.booleanOrNull != true) throw XxtFailure("LOGIN", "学习通登录失败，请核对账号密码；如需额外验证，请使用二维码。")
        return user()
    }
    override suspend fun user(): XxtUser {
        val profile = buildJsonObject { put("app_name", "com.chaoxing.mobile"); put("app_ver", "6.7.4"); put("device_id", device); put("cdid", device); put("platform", "android"); put("time_stamp", System.currentTimeMillis()) }
        val result = json(xxtRequest("https://sso.chaoxing.com/apis/login/userLogin4Uname.do", mapOf("data" to xxtRsa(profile.toString())), true))
        if (result.number("result") != 1) throw XxtFailure("SESSION", "学习通会话已过期，请重新登录。")
        val data = result["msg"] as? JsonObject ?: throw XxtFailure("FORMAT", "学习通用户响应格式有变。")
        val deviceInfo = runCatching { Json.parseToJsonElement(xxtRsa(data.text("clientId"), decrypt = true)).jsonObject }.getOrNull()
        return XxtUser(data.text("puid"), data.text("name"), deviceInfo?.text("cid").orEmpty(), deviceInfo?.text("sc").orEmpty()).also { require(it.uid.matches(Regex("\\d+"))) }
    }
    override suspend fun qrLogin(): XxtQrLogin {
        val data = json(xxtRequest("https://passport2.chaoxing.com/refreshQRCode", post = true))
        val uuid = data.text("uuid"); val enc = data.text("enc")
        require(uuid.isNotBlank() && enc.isNotBlank())
        return XxtQrLogin(uuid, enc, raw(xxtRequest("https://passport2.chaoxing.com/createqr", mapOf("uuid" to uuid, "fid" to "-1")), true))
    }
    override suspend fun pollQr(qr: XxtQrLogin): XxtUser? {
        val result = json(xxtRequest("https://passport2.chaoxing.com/getauthstatus/v2", mapOf("uuid" to qr.uuid, "enc" to qr.enc, "doubleFactorLogin" to "0", "forbidotherlogin" to "0"), true))
        return if (result["status"]?.jsonPrimitive?.booleanOrNull == true) user() else null
    }
    override suspend fun courses() = xxtCourses(json(xxtRequest("https://mooc1-api.chaoxing.com/mycourse/backclazzdata", mapOf("view" to "json", "getTchClazzType" to "1", "mcode" to ""))))
    override suspend fun activities(course: XxtCourse): List<XxtActivity> {
        val current = user()
        val join = json(xxtRequest("https://mooc1-api.chaoxing.com/gas/clazzperson", mapOf("courseid" to course.id, "clazzid" to course.classId, "userid" to current.uid, "personid" to course.cpi, "view" to "json", "fields" to "clazzid,popupagreement,personid,clazzname,createtime")))
        val joined = (join["data"] as? JsonArray)?.firstOrNull()?.jsonObject?.text("createtime").orEmpty()
        val fields = linkedMapOf("courseId" to course.id, "classId" to course.classId, "uid" to current.uid, "cpi" to course.cpi, "joinclasstime" to joined)
        val app = json(xxtRequest("$XXT_MOBILE/ppt/activeAPI/taskactivelist", xxtSigned(fields, UUID.randomUUID().toString().replace("-", ""), System.currentTimeMillis())))
        val web = json(xxtRequest("$XXT_MOBILE/v2/apis/active/student/activelist", mapOf("fid" to "0", "courseId" to course.id, "classId" to course.classId, "showNotStartedActive" to "0", "_" to "${System.currentTimeMillis()}")))
        return xxtActivities(app, web)
    }
    override suspend fun detail(activity: XxtActivity): XxtSignDetail {
        val info = json(xxtRequest("$XXT_MOBILE/v2/apis/active/getPPTActiveInfo", mapOf("activeId" to activity.id)))
        val attend = json(xxtRequest("$XXT_MOBILE/v2/apis/sign/getAttendInfo", mapOf("activeId" to activity.id, "moreClassAttendEnc" to "")))
        if (info.number("result") != 1 || attend.number("result") != 1) throw XxtFailure("UPSTREAM", "无法读取当前账号的签到详情。")
        return xxtDetail(info["data"]!!.jsonObject, attend["data"]!!.jsonObject)
    }
    private suspend fun upload(path: String, user: XxtUser): String = withContext(Dispatchers.IO) {
        val file = File(path); require(file.isFile && file.length() in 1..6 * 1024 * 1024)
        val bytes = file.readBytes()
        val token = json(xxtRequest("https://pan-yz.chaoxing.com/api/token/uservalid")).text("_token").also { require(it.isNotBlank()) }
        val digestBytes = (if (bytes.size > 1048576) bytes.take(524288).toByteArray() + bytes.takeLast(524288).toByteArray() else bytes) + bytes.size.toString(16).toByteArray()
        val crc = json(xxtRequest("https://pan-yz.chaoxing.com/api/crcStorageStatus", mapOf("puid" to user.uid, "crc" to xxtMd5(digestBytes), "_token" to token)))
        if (crc["exist"]?.jsonPrimitive?.booleanOrNull == true) return@withContext crc["data"]!!.jsonObject.text("objectid")
        val form = MultipartBody.Builder().setType(MultipartBody.FORM).addFormDataPart("puid", user.uid).addFormDataPart("file", "photo.jpg", bytes.toRequestBody("image/jpeg".toMediaType())).build()
        val request = xxtRequest("https://pan-yz.chaoxing.com/upload?_from=mobilelearn&_token=${xxtEncode(token)}").newBuilder().post(form).build()
        json(request)["data"]!!.jsonObject.text("objectId").also { require(it.isNotBlank()) }
    }
    override suspend fun sign(user: XxtUser, plan: XxtSignPlan, validate: String, enc2: String): XxtSignResult {
        xxtValidate(plan, System.currentTimeMillis())
        val current = user()
        if (current.uid != user.uid) throw XxtFailure("SESSION", "学习通账号已变更，请重新加载。")
        val latest = detail(plan.activity)
        if (latest.face) throw XxtFailure("UNSUPPORTED", "此活动要求人脸签到，请使用官方学习通。")
        if (latest != plan.detail) throw XxtFailure("CHANGED", "活动要求已变更，请重新加载并确认。")
        if (plan.position != null && (current.cid.isBlank() || current.sc.isBlank())) throw XxtFailure("UNSUPPORTED", "学习通未返回当前设备的位置签名信息，请使用官方学习通。")
        val objectId = if (plan.detail.photo) upload(plan.photoPath, current) else ""
        val fields = xxtSignFields(current, plan, xxtAes(UUID.randomUUID().toString(), "QrCbNY@MuK1X8HGw", false), System.currentTimeMillis(), objectId, validate, enc2)
        return try { xxtSignResult(raw(xxtRequest("$XXT_MOBILE/pptSign/stuSignajax", fields, post = plan.detail.type != 0 || plan.detail.photo)).toString(Charsets.UTF_8)) }
        catch (e: XxtFailure) { if (e.kind == "NETWORK" || e.kind == "FORMAT") XxtSignResult.Unknown else throw e }
    }
    private suspend fun jsonp(url: String, fields: Map<String, String>): JsonObject {
        val text = raw(xxtRequest(url, fields)).toString(Charsets.UTF_8)
        return Json.parseToJsonElement(text.substringAfter("cx_captcha_function(").substringBeforeLast(')')).jsonObject
    }
    override suspend fun captcha(plan: XxtSignPlan): XxtCaptcha {
        val id = "Qt9FIw9o4pwRjOyqM6yizZBh682qN2TU"; val stamp = System.currentTimeMillis()
        val config = jsonp("https://captcha.chaoxing.com/captcha/get/conf", mapOf("callback" to "cx_captcha_function", "captchaId" to id, "_" to "$stamp"))
        val time = config.text("t").toLong(); val key = xxtMd5("$time${UUID.randomUUID()}")
        val token = "${xxtMd5("${time}${id}slide$key")}:${time + 300000}"
        val iv = xxtMd5("${id}slide${stamp}${UUID.randomUUID()}")
        val referer = "$XXT_MOBILE/widget/sign/e?id=${plan.activity.id}"
        val data = jsonp("https://captcha.chaoxing.com/captcha/get/verification/image", mapOf("callback" to "cx_captcha_function", "captchaId" to id, "type" to "slide", "version" to "1.1.20", "captchaKey" to key, "token" to token, "referer" to referer, "iv" to iv, "_" to "${stamp + 1}"))
        val images = data["imageVerificationVo"]!!.jsonObject
        return XxtCaptcha(data.text("token").ifBlank { token }, iv, stamp, raw(xxtRequest(images.text("shadeImage")), true), raw(xxtRequest(images.text("cutoutImage")), true), images.text("originalWidth").toIntOrNull()?.coerceIn(1, 4096) ?: 320)
    }
    override suspend fun solveCaptcha(challenge: XxtCaptcha, x: Int, plan: XxtSignPlan): String {
        require(x in 0..challenge.originalWidth && System.currentTimeMillis() - challenge.stamp in 0..300000)
        val data = jsonp("https://captcha.chaoxing.com/captcha/check/verification/result", mapOf("callback" to "cx_captcha_function", "captchaId" to "Qt9FIw9o4pwRjOyqM6yizZBh682qN2TU", "type" to "slide", "token" to challenge.token, "textClickArr" to "[{\"x\":$x}]", "coordinate" to "[]", "runEnv" to "10", "version" to "1.1.20", "t" to "a", "iv" to challenge.iv, "_" to "${challenge.stamp + 2}"))
        if (data.number("error") != 0 || data["result"]?.jsonPrimitive?.booleanOrNull != true) throw XxtFailure("CAPTCHA", "拼图验证失败，请重新加载并手动拖动。")
        return Json.parseToJsonElement(data.text("extraData")).jsonObject.text("validate").also { require(it.isNotBlank()) }
    }
    override suspend fun clear() = withContext(Dispatchers.IO) { jar.disable(); storage.clear() }
}
private const val XXT_RSA = "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC79d8Ot0hCbxxSISC6x8SCwTBspFSzlLKHJUYqoFNu1TSRaw4hEYkOnvEaL1VyoxV6HXcDrzwYvaFZaZaPQPFnfCHZy5dQwxcmifgSHqS+oKXw40Ys4cVIqnU5d90S7EWSRdBglX489jlqVaNcQSkDx2TYmC+DbAq9FV/BU09ISQIDAQAB"
internal fun xxtRsa(value: String, decrypt: Boolean = false): String {
    val key = KeyFactory.getInstance("RSA").generatePublic(X509EncodedKeySpec(Base64.getDecoder().decode(XXT_RSA)))
    val cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding")
    cipher.init(if (decrypt) Cipher.DECRYPT_MODE else Cipher.ENCRYPT_MODE, key)
    val bytes = if (decrypt) Base64.getDecoder().decode(value) else value.toByteArray(Charsets.UTF_8)
    val output = bytes.toList().chunked(if (decrypt) 128 else 117).fold(byteArrayOf()) { all, chunk -> all + cipher.doFinal(chunk.toByteArray()) }
    return if (decrypt) output.toString(Charsets.UTF_8) else Base64.getEncoder().encodeToString(output)
}
