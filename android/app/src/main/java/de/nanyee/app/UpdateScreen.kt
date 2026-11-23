package de.nanyee.app

import android.app.Application
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.Toast
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

internal class UpdateState(app: Application) : AndroidViewModel(app) {
    private val preferences = app.getSharedPreferences("app_updates", Context.MODE_PRIVATE)
    private var work: Job? = null
    var notice by mutableStateOf<AppRelease?>(null); private set
    fun check(manual: Boolean = false, preview: AppRelease? = null) {
        if (preview != null) { notice = preview; return }
        if (work?.isActive == true) return
        work = viewModelScope.launch {
            try {
                val release = withContext(Dispatchers.IO) {
                    val now = System.currentTimeMillis()
                    if (!updateCheckDue(now, preferences.getLong("checked", 0), manual)) return@withContext null
                    if (!preferences.edit().putLong("checked", now).commit()) return@withContext null
                    val client = OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS).readTimeout(3, TimeUnit.SECONDS)
                        .callTimeout(5, TimeUnit.SECONDS).retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).build()
                    client.newCall(Request.Builder().url("https://nanyee.de/downloads/android/version.json").build()).execute().use { response ->
                        if (!response.isSuccessful) return@use null
                        val source = response.body?.source() ?: return@use null
                        source.request(65_537)
                        if (source.buffer.size > 65_536) null else parseAppRelease(source.readUtf8())
                    }
                }
                if (release != null && offerUpdate(release, BuildConfig.VERSION_CODE, preferences.getInt("dismissed", 0), manual)) notice = release
            } catch (e: CancellationException) { throw e } catch (_: Exception) { }
        }
    }
    fun dismiss() {
        notice?.let { preferences.edit().putInt("dismissed", it.versionCode).apply() }
        notice = null
    }
}

internal fun openAppLink(context: Context, url: String) {
    if (!validReleaseUrl(url) && url != "https://github.com/apograss/nanyee") return
    try { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: ActivityNotFoundException) { }
}

@Composable
internal fun UpdateNotice(state: UpdateState) {
    val context = LocalContext.current
    state.notice?.let { release ->
        AlertDialog(onDismissRequest = state::dismiss, title = { Text("新版本 ${release.versionName}") },
            text = if (release.notes.isBlank()) null else { { Text(release.notes, Modifier.heightIn(max = 240.dp).verticalScroll(rememberScrollState())) } },
            confirmButton = { TextButton(onClick = { openAppLink(context, release.url); state.dismiss() }) { Text("下载") } },
            dismissButton = { TextButton(onClick = state::dismiss) { Text("稍后") } })
    }
}

private const val CONTACT_EMAIL = "contact@nanyee.de"
private fun copyContact(context: Context) {
    context.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("邮箱", CONTACT_EMAIL))
    Toast.makeText(context, "邮箱已复制", Toast.LENGTH_SHORT).show()
}
private fun sendFeedback(context: Context) {
    val subject = "Nanyee 反馈"
    val body = "Nanyee ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})\nAndroid ${Build.VERSION.RELEASE}\n${Build.MANUFACTURER} ${Build.MODEL}\n\n"
    val uri = Uri.parse(feedbackMailto(subject, body, Uri::encode))
    val intent = Intent(Intent.ACTION_SENDTO, uri).putExtra(Intent.EXTRA_EMAIL, arrayOf(CONTACT_EMAIL))
        .putExtra(Intent.EXTRA_SUBJECT, subject).putExtra(Intent.EXTRA_TEXT, body)
    try { context.startActivity(intent) } catch (_: ActivityNotFoundException) { copyContact(context) }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun FeedbackRow() {
    val context = LocalContext.current
    Card(modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Row(Modifier.fillMaxWidth().combinedClickable(onClick = { sendFeedback(context) }, onLongClick = { copyContact(context) }).heightIn(min = 52.dp).padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AccentIcon(Icons.Outlined.MailOutline, SectionAccent.BRAND)
            Text("反馈", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun AppAbout(state: UpdateState) {
    val context = LocalContext.current
    var licenses by remember { mutableStateOf(false) }
    Text("关于", style = MaterialTheme.typography.titleLarge)
    ListItem(headlineContent = { Text("Nanyee") }, supportingContent = { Text("${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})") })
    TextButton(onClick = { state.check(manual = true) }, modifier = Modifier.fillMaxWidth()) { Text("检查更新") }
    TextButton(onClick = { licenses = true }, modifier = Modifier.fillMaxWidth()) { Text("开源许可") }
    ListItem(headlineContent = { Text(CONTACT_EMAIL, fontFamily = FontFamily.Monospace) }, modifier = Modifier.combinedClickable(onClick = { sendFeedback(context) }, onLongClick = { copyContact(context) }))
    if (licenses) OpenSourceLicenses { licenses = false }
}
