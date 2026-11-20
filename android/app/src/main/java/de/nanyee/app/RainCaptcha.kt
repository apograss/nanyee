package de.nanyee.app

import android.annotation.SuppressLint
import android.net.http.SslError
import android.webkit.JavascriptInterface
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.os.Build
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

private const val RAIN_CAPTCHA_ORIGIN = "https://appassets.androidplatform.net/rain_captcha.html"

internal class RainCaptchaBridge(private val loaded: (String) -> Unit, private val completed: (String, String) -> Unit) {
    @JavascriptInterface fun ready(nonce: String) = loaded(nonce)
    @JavascriptInterface fun complete(nonce: String, result: String) { if (result.length <= 16384) completed(nonce, result) }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
internal fun RainCaptchaDialog(onDismiss: () -> Unit, onProof: (RainCaptchaProof) -> Unit) {
    val nonce = remember { UUID.randomUUID().toString() }
    val closed = remember { AtomicBoolean(false) }
    val currentProof by rememberUpdatedState(onProof)
    var web by remember { mutableStateOf<WebView?>(null) }
    var status by remember { mutableStateOf("正在加载腾讯验证码…") }
    DisposableEffect(Unit) {
        onDispose { closed.set(true); web?.apply { stopLoading(); removeJavascriptInterface("RainCaptcha"); destroy() }; web = null }
    }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth().fillMaxHeight(0.9f).padding(12.dp)) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("腾讯安全验证", style = MaterialTheme.typography.titleLarge)
                Text(status, style = MaterialTheme.typography.bodySmall)
                AndroidView(modifier = Modifier.weight(1f).fillMaxWidth(), factory = { context ->
                    WebView(context).apply {
                        web = this
                        setBackgroundColor(android.graphics.Color.rgb(245, 246, 250))
                        settings.apply {
                            javaScriptEnabled = true; domStorageEnabled = true
                            allowFileAccess = false; allowContentAccess = false
                            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                            cacheMode = WebSettings.LOAD_NO_CACHE
                            if (Build.VERSION.SDK_INT >= 33) isAlgorithmicDarkeningAllowed = false
                        }
                        webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                                (request.isForMainFrame && request.url.toString() != RAIN_CAPTCHA_ORIGIN) || request.url.scheme !in setOf("https", "about")
                            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) { handler.cancel(); status = "安全连接失败，请关闭后重试。" }
                            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                                if (request.isForMainFrame) status = "腾讯验证码加载失败，请检查网络后重试。"
                            }
                        }
                        addJavascriptInterface(RainCaptchaBridge({ received ->
                            post { if (!closed.get() && received == nonce && url == RAIN_CAPTCHA_ORIGIN) status = "请完成腾讯验证；可随时取消。" }
                        }, { received, result ->
                            post {
                                if (!closed.get() && received == nonce && url == RAIN_CAPTCHA_ORIGIN) {
                                    val proof = rainCaptchaProof(result)
                                    if (proof != null && closed.compareAndSet(false, true)) currentProof(proof)
                                    else status = "验证未完成，请关闭后重试。"
                                }
                            }
                        }), "RainCaptcha")
                        val html = context.assets.open("rain_captcha.html").bufferedReader().use { it.readText() }
                            .replace("__NONCE__", nonce).replace("__DARK__", "false").replace("__TEXT__", "#242630")
                        loadDataWithBaseURL(RAIN_CAPTCHA_ORIGIN, html, "text/html", "UTF-8", RAIN_CAPTCHA_ORIGIN)
                    }
                })
                TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) { Text("取消验证") }
            }
        }
    }
}
