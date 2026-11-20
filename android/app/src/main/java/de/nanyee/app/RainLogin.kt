package de.nanyee.app

import kotlinx.serialization.json.*
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.util.UUID

internal enum class RainLoginMethod(val label: String) { QR("扫码"), PASSWORD("密码"), SMS("短信") }
internal data class RainCaptchaProof(val ticket: String, val rand: String) {
    init { require(ticket.isNotBlank() && rand.isNotBlank() && ticket.length <= 8192 && rand.length <= 1024) }
}
internal fun rainCaptchaProof(value: String): RainCaptchaProof? = runCatching {
    require(value.length <= 16384)
    val result = Json.parseToJsonElement(value).jsonObject
    require((result["ret"] as? JsonPrimitive)?.intOrNull == 0)
    RainCaptchaProof(result.text("ticket"), result.text("randstr"))
}.getOrNull()

internal fun rainInitialHost(store: RainStore): RainHost {
    val saved = runCatching { RainHost.valueOf(store.read("host")) }.getOrDefault(RainHost.CHANGJIANG)
    val host = if (store.read("changjiang-default-v1") != "1" && saved == RainHost.WWW && store.read("host.explicit") != "WWW") RainHost.CHANGJIANG else saved
    store.write("host", host.name)
    store.write("changjiang-default-v1", "1")
    return host
}
internal fun rainDeviceId(store: RainStore): String = store.read("device-id").ifBlank { UUID.randomUUID().toString().also { store.write("device-id", it) } }
internal fun rainSmsBody(phone: String, proof: RainCaptchaProof) = buildJsonObject {
    require(phone.matches(Regex("1[0-9]{10}")))
    put("phoneNumber", phone); put("email", ""); put("ticket", proof.ticket); put("rand", proof.rand)
}
internal fun rainVerifyBody(phone: String, code: String) = buildJsonObject {
    require(phone.matches(Regex("1[0-9]{10}")) && code.matches(Regex("[0-9]{4,8}")))
    put("phoneNumber", phone); put("email", ""); put("code", code)
}
internal fun rainLoginBody(method: RainLoginMethod, account: String, code: String, proof: RainCaptchaProof, deviceId: String) = buildJsonObject {
    require(method != RainLoginMethod.QR && account.isNotBlank() && code.isNotBlank() && deviceId.isNotBlank())
    if (method == RainLoginMethod.SMS) rainVerifyBody(account, code)
    val email = method == RainLoginMethod.PASSWORD && '@' in account
    put("type", if (method == RainLoginMethod.SMS) 3 else if (email) 2 else 1)
    put("phoneNumber", if (email) "" else account); put("email", if (email) account else "")
    put("password", if (method == RainLoginMethod.PASSWORD) code else ""); put("code", if (method == RainLoginMethod.SMS) code else "")
    put("pushDeviceId", deviceId); put("ticket", proof.ticket); put("rand", proof.rand)
}
internal fun rainLoginMessage(value: JsonObject, fallback: String) = xxtPlain(value.text("msg")).take(240).ifBlank { fallback }
internal fun rainQrImageAllowed(host: RainHost, image: String) = runCatching {
    val url = image.toHttpUrl()
    url.isHttps && url.port == 443 && url.username.isEmpty() && url.password.isEmpty() && url.host in setOf(host.domain, "mp.weixin.qq.com")
}.getOrDefault(false)
internal fun rainQrPollingAllowed(visible: Boolean, foreground: Boolean, hasQr: Boolean, backgroundUntil: Long, now: Long) =
    visible && (foreground || (hasQr && now < backgroundUntil))
