package de.nanyee.app

import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonObject

internal sealed interface SilentLoginResult {
    data class Success(val session: JsonObject) : SilentLoginResult
    data class Manual(val message: String) : SilentLoginResult
}

internal suspend fun silentLogin(
    source: SchoolDataSource,
    account: String,
    password: String,
    recognize: suspend (String) -> String
): SilentLoginResult {
    repeat(3) { attempt ->
        try {
            val captcha = source.request("captcha")
            val answer = recognize(captcha.text("image_base64"))
            val response = source.request("session", payload("flow_id" to captcha.text("flow_id"), "account" to account, "password" to password, "captcha" to answer))
            if (response.text("academic_session_id").isEmpty() || response.text("expires_at").isEmpty()) {
                return SilentLoginResult.Manual("自动登录响应无效，请手动登录。")
            }
            return SilentLoginResult.Success(response)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            if (e is SchoolError && e.code == "UPSTREAM_REJECTED" && e.reason == "bad_captcha" && e.status != 429 && attempt < 2) return@repeat
            return SilentLoginResult.Manual(if (e is SchoolError) e.message ?: "自动登录失败，请手动登录。" else "自动识别未完成，请手动登录。")
        }
    }
    return SilentLoginResult.Manual("自动识别未完成，请手动登录。")
}
