package de.nanyee.app

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

@Composable
@OptIn(ExperimentalLayoutApi::class)
internal fun RainLoginPanel(state: RainState) {
    val method = state.loginMethod
    var account by state::loginAccount
    var secret by state::loginSecret
    var challenge by remember(state.host, method) { mutableStateOf("") }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(state.smsDeadline) { while (System.currentTimeMillis() < state.smsDeadline) { now = System.currentTimeMillis(); delay(500) }; now = System.currentTimeMillis() }
    val remaining = classroomSmsResendSeconds(state.smsDeadline, now)
    val phoneValid = account.matches(Regex("1[0-9]{10}"))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("${if (state.host == RainHost.CHANGJIANG) "长江雨课堂 · " else ""}${state.host.domain}", style = MaterialTheme.typography.bodySmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RainLoginMethod.entries.forEach { option ->
                FilterChip(selected = method == option, onClick = { state.selectLoginMethod(option) }, enabled = !state.busy, label = { Text(option.label) })
            }
        }
        if (method == RainLoginMethod.QR) {
            Button(onClick = state::beginQr, enabled = !state.busy && state.qr == null) { Text("获取雨课堂登录二维码") }
            Text("扫码登录仅保留加密会话，不保存密码。切到微信后继续等待最多 60 秒。", style = MaterialTheme.typography.bodySmall)
            state.qr?.let { qr ->
                var imageError by remember(qr) { mutableStateOf(false) }
                val bitmap by produceState<Bitmap?>(null, qr, state.host) {
                    value = try { state.qrBitmap(qr) } catch (e: CancellationException) { throw e } catch (_: Exception) { imageError = true; null }
                        ?: qr.content.takeIf { it.isNotBlank() }?.let { runCatching { rainQrBitmap(it) }.getOrNull() }
                }
                if (bitmap != null) Image(requireNotNull(bitmap).asImageBitmap(), "雨课堂官方登录授权二维码", Modifier.fillMaxWidth().height(260.dp), contentScale = ContentScale.Fit)
                else Text(if (imageError) "二维码图片不可用，请取消后重新获取。" else "正在加载二维码…")
                TextButton(onClick = state::cancelQr) { Text("取消扫码登录") }
            }
        } else {
            OutlinedTextField(value = account, onValueChange = { account = it.trim() }, label = { Text(if (method == RainLoginMethod.SMS) "手机号" else "手机号或邮箱") }, singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = if (method == RainLoginMethod.SMS) KeyboardType.Phone else KeyboardType.Email))
            OutlinedTextField(value = secret, onValueChange = { secret = it }, label = { Text(if (method == RainLoginMethod.SMS) "短信验证码" else "密码") }, singleLine = true, enabled = !state.busy, modifier = Modifier.fillMaxWidth(), visualTransformation = if (method == RainLoginMethod.PASSWORD) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None, keyboardOptions = KeyboardOptions(keyboardType = if (method == RainLoginMethod.SMS) KeyboardType.Number else KeyboardType.Password))
            if (method == RainLoginMethod.SMS) {
                OutlinedButton(onClick = { if (state.demo) state.sendSms(account, RainCaptchaProof("offline-ticket", "offline-rand")) else challenge = "sms" }, enabled = !state.busy && phoneValid && remaining == 0) { Text(if (remaining > 0) "${remaining} 秒后重发" else "腾讯验证并发送验证码") }
                Text(if (state.demo) "离线演示，不联网；验证码 123456。" else "发送短信前需完成腾讯验证。验证码仅用于本次登录。", style = MaterialTheme.typography.bodySmall)
                Button(onClick = { state.login(method, account, secret) }, enabled = !state.busy && phoneValid && secret.matches(Regex("[0-9]{4,8}"))) { Text("短信登录") }
            } else {
                Text(if (state.demo) "离线演示，任意非空密码；不会加载网络验证码。" else "密码仅用于本次登录，不保存。登录前需完成腾讯安全验证。", style = MaterialTheme.typography.bodySmall)
                Button(onClick = { if (state.demo) state.login(method, account, secret, RainCaptchaProof("offline-ticket", "offline-rand")) else challenge = "password" }, enabled = !state.busy && account.isNotBlank() && secret.isNotBlank()) { Text("腾讯验证并登录") }
            }
        }
    }
    if (challenge.isNotBlank() && !state.demo) RainCaptchaDialog(onDismiss = { challenge = "" }) { proof ->
        val action = challenge
        challenge = ""
        if (action == "sms") state.sendSms(account, proof) else if (action == "password") state.login(method, account, secret, proof)
    }
}
