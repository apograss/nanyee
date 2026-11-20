package de.nanyee.app

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.NotificationsNone
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.serialization.json.*

private fun accountActivity(context: Context): Activity? = when (context) { is Activity -> context; is ContextWrapper -> accountActivity(context.baseContext); else -> null }

@Composable
internal fun MyScreen(school: SchoolState) {
    val account: AccountState = viewModel(key = "platform-account")
    val profile = account.model?.user
    val name = if (school.demo) "演示同学" else profile?.text("nickname").orEmpty().ifBlank { profile?.text("username").orEmpty() }.ifBlank { "你好，同学" }
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant).verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        ProfileHero(name, if (school.demo) "学号 2026000001 · 示例" else if (school.loggedIn) "学号 ${school.account}" else "登录学校账号，连接校园生活", name.take(1), if (school.demo) "离线演示 · 数据不联网" else if (account.demo) "平台离线演示 · 学校会话独立" else if (school.cachedMode) "本机课表 · 学校会话未登录" else "学校与平台账号彼此独立")
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { AccountSection(state = account, demoOnly = school.demo) }
        }
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionHeading("学校账号", "本机加密课表 · 与平台会话独立", Icons.Outlined.School, SectionAccent.ACADEMIC)
                if (!school.homeVisible) Login(school, embedded = true)
                else {
                    Text(if (school.demo) "学校演示模式" else if (school.cachedMode) "正在查看本机课表 · 未登录" else "已登录学校系统")
                    if (!school.demo && school.loggedIn) Text("会话到期：${school.expires}")
                    Text("课表在本机加密保存；学校会话与成绩仅保存在内存中。Nanyee 平台退出不影响学校账号。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = school::logout) { Text(if (school.demo) "退出学校演示模式" else "退出学校并清除本机课表") }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AccountSection(state: AccountState = viewModel(key = "platform-account"), demoOnly: Boolean = false) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val revision by PlatformSession.revision.collectAsState()
    val uri = LocalUriHandler.current
    LaunchedEffect(revision, demoOnly) { state.open(demoOnly) }
    DisposableEffect(lifecycle, state, demoOnly) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) state.clearTransient()
            if (event == Lifecycle.Event.ON_RESUME) state.open(demoOnly)
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer); state.clearTransient() }
    }
    SectionHeading("Nanyee 账号", "自习舱与自动评课共用的平台会话", Icons.Outlined.AccountCircle)
    if (state.initializationError.isNotBlank()) Text(state.initializationError, color = MaterialTheme.colorScheme.error)
    val model = state.model
    if (model == null) { Button(onClick = { state.open(demoOnly) }) { Text("打开平台账号") }; return }
    BackHandler(model.route.isNotEmpty() && !model.busy) { model.navigate("") }
    if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
    if (model.error.isNotBlank()) Text(model.error, color = MaterialTheme.colorScheme.error)
    if (model.message.isNotBlank()) Text(model.message, color = MaterialTheme.colorScheme.primary)
    if (state.demo) {
        Text("离线演示 · 验证码 123456 · 不改变真实账号", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    val enabled = !model.busy && model.pending == null
    var accountMenu by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        if (state.demo) ScenarioPicker(state.fixture.failure.label, AccountDemoFailure.entries.map { it.label }, enabled) { state.selectScenario(AccountDemoFailure.entries[it]) }
        Spacer(Modifier.weight(1f))
        Box {
            IconButton(onClick = { accountMenu = true }, enabled = enabled) { Icon(Icons.Outlined.MoreHoriz, "Nanyee 账号操作") }
            DropdownMenu(expanded = accountMenu, onDismissRequest = { accountMenu = false }) {
                DropdownMenuItem(text = { Text("刷新") }, onClick = { accountMenu = false; state.open(demoOnly) })
                if (model.user != null) DropdownMenuItem(text = { Text("退出 Nanyee…") }, onClick = { accountMenu = false; model.review(AccountWrite.LOGOUT) })
                if (!demoOnly) DropdownMenuItem(text = { Text(if (state.demo) "返回真实平台" else "离线演示") }, onClick = { accountMenu = false; state.switchDemo() })
            }
        }
    }
    if (model.error.contains("请在网页完成验证")) AssistChip(onClick = { uri.openUri("https://nanyee.de/account") }, label = { Text("在网页完成验证") })
    if (model.route.isNotEmpty()) TextButton(onClick = { model.navigate("") }, enabled = enabled) { Text("返回 Nanyee 账号") }
    when {
        model.route == "reset" -> {
            Text("忘记平台密码", style = MaterialTheme.typography.titleLarge)
            AccountChallengeFields(model, reset = true, enabled)
            Text("只有已绑定邮箱的账号才能找回；重置成功后所有平台会话会退出。")
        }
        model.user == null -> {
            CabinField("平台用户名", model.username, { model.username = it }, enabled)
            CabinField("平台密码", model.password, { model.password = it }, enabled, password = true)
            Button(onClick = { model.review(AccountWrite.LOGIN) }, enabled = enabled) { Text("登录 Nanyee…") }
            FlowRow {
                TextButton(onClick = { model.navigate("reset") }, enabled = enabled) { Text("忘记密码") }
                TextButton(onClick = { uri.openUri("https://nanyee.de/auth/register") }) { Text("去网站注册") }
            }
        }
        else -> {
            val profile = requireNotNull(model.user)
            Text("@${profile.text("username")} · ${profile.text("nickname")}", style = MaterialTheme.typography.titleLarge)
            Text("邮箱：${profile.text("email").ifBlank { "未绑定" }} · ${if ((profile["email_verified"] as? JsonPrimitive)?.booleanOrNull == true) "已验证" else "未验证"}")
            Text("角色：${profile.text("role")}")
            when (model.route) {
                "email" -> {
                    AccountChallengeFields(model, reset = false, enabled)
                    if (profile.text("email").isNotBlank()) {
                        CabinField("当前平台密码（换绑或解绑）", model.password, { model.password = it }, enabled, password = true)
                        OutlinedButton(onClick = { model.review(AccountWrite.EMAIL_UNBIND) }, enabled = enabled) { Text("解绑邮箱…") }
                        Text("解绑无需验证码，但必须验证当前密码；解绑后无法通过邮件找回。")
                    }
                }
                "credentials" -> AccountCredentials(model, enabled)
                "jobs", "job" -> AccountJobs(state, model, enabled)
                else -> {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { model.navigate("email") }, enabled = enabled) { Text("邮箱设置") }
                        OutlinedButton(onClick = { model.navigate("credentials") }, enabled = enabled) { Text("托管凭据 (${model.credentials.size})") }
                        OutlinedButton(onClick = { model.navigate("jobs") }, enabled = enabled) { Text("任务 (${model.jobs.size})") }
                    }
                }
            }
            SectionHeading("提醒", "仅显示当前账号的通知", Icons.Outlined.NotificationsNone, SectionAccent.SERVICE)
            if (model.notices.isEmpty()) Text("暂无提醒")
            model.notices.forEach { notice -> Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(notice.text("title"), style = MaterialTheme.typography.titleSmall)
                    Text(notice.text("message"))
                    if ((notice["dismissible"] as? JsonPrimitive)?.booleanOrNull == true) TextButton(onClick = { model.dismissNotice(notice.text("id")) }) { Text("本机关闭") }
                }
            } }
        }
    }
    model.pending?.let { action -> AlertDialog(onDismissRequest = model::dismissConfirmation, title = { Text("请确认") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(action.kind.label)
            Text("账号：${model.user?.text("username") ?: model.username}")
            action.body?.text("email")?.takeIf { it.isNotBlank() }?.let { Text("邮箱：$it") }
            if (action.path.startsWith("/credentials/") || action.path.startsWith("/jobs/")) Text("目标：${action.path.split('/')[2].substringBefore('?')}")
            if (action.kind == AccountWrite.RENEW) Text("有效期：${action.body?.get("ttl_seconds")?.jsonPrimitive?.int?.div(86400)} 天")
            Text(if (state.demo) "仅操作离线演示数据。" else "将向 nanyee.de 提交；密码与托管秘密不会显示在确认摘要中。")
        }
    }, confirmButton = { TextButton(onClick = state::confirm) { Text("确认") } }, dismissButton = { TextButton(onClick = model::dismissConfirmation) { Text("取消") } }) }
    val window = accountActivity(LocalContext.current)?.window
    DisposableEffect(window, model.revealed.isNotEmpty()) {
        val wasSecure = window?.attributes?.flags?.and(WindowManager.LayoutParams.FLAG_SECURE) != 0
        if (model.revealed.isNotEmpty()) window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { if (!wasSecure) window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
    if (model.revealed.isNotEmpty()) AlertDialog(onDismissRequest = model::hideSecret, title = { Text("托管秘密 · 仅屏幕显示") }, text = { Text(model.revealed, Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) }, confirmButton = { TextButton(onClick = model::hideSecret) { Text("关闭并清空") } })
}

@Composable
private fun AccountChallengeFields(model: AccountModel, reset: Boolean, enabled: Boolean) {
    CabinField(if (reset) "已绑定的邮箱" else "要绑定的新邮箱", model.email, { model.email = it }, enabled)
    if (!reset && !model.user?.text("email").isNullOrBlank()) Text("换绑需在下方输入当前平台密码。")
    Button(onClick = { model.review(if (reset) AccountWrite.RESET_CODE else AccountWrite.EMAIL_CODE) }, enabled = enabled) { Text("发送 / 重发验证码…") }
    model.challenge?.let { challenge ->
        Text("发送至 ${challenge.maskedEmail}\n有效期至 ${challenge.expires}\n可重发时间 ${challenge.resend}", style = MaterialTheme.typography.bodySmall)
        CabinField("六位验证码", model.code, { model.code = it }, enabled)
        if (reset) CabinField("新平台密码（8–128 字符）", model.newPassword, { model.newPassword = it }, enabled, password = true)
        Button(onClick = { model.review(if (reset) AccountWrite.RESET_CONFIRM else AccountWrite.EMAIL_CONFIRM) }, enabled = enabled) { Text(if (reset) "确认重置密码…" else "确认绑定 / 换绑…") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AccountCredentials(model: AccountModel, enabled: Boolean) {
    Text("托管凭据", style = MaterialTheme.typography.titleLarge)
    Text("新增凭据请到自习舱或自动评课的同意托管流程。更新秘密可能恢复关联任务；撤销或删除会影响任务。")
    if (model.credentials.isEmpty()) Text("暂无托管凭据")
    model.credentials.forEach { row ->
        val id = row.text("id")
        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("${accountPurpose(row.text("purpose"))} · ${accountStatus(row.text("status"))}", style = MaterialTheme.typography.titleMedium)
            Text("有效期：${row.text("expires_at").ifBlank { "永久" }}")
            Text("编号：$id", style = MaterialTheme.typography.bodySmall)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TextButton(onClick = { model.editCredential(id) }, enabled = enabled && row.text("status") == "active") { Text("更新秘密") }
                TextButton(onClick = { model.review(AccountWrite.REVEAL, id) }, enabled = enabled && row.text("status") == "active") { Text("查看秘密…") }
                TextButton(onClick = { model.review(AccountWrite.REVOKE, id) }, enabled = enabled && row.text("status") == "active") { Text("撤销…") }
                TextButton(onClick = { model.review(AccountWrite.DELETE, id) }, enabled = enabled) { Text("永久删除…") }
            }
            if (row["expires_at"] != null && row["expires_at"] != JsonNull && row.text("status") == "active") {
                CabinField("续期天数（1–365）", model.ttlDays, { model.ttlDays = it }, enabled)
                TextButton(onClick = { model.review(AccountWrite.RENEW, id) }, enabled = enabled) { Text("续期…") }
            }
            if (model.editing == id) {
                if (row.text("purpose") != "qun_checkin") CabinField("原学校账号", model.schoolAccount, { model.schoolAccount = it }, enabled)
                CabinField(if (row.text("purpose") == "qun_checkin") "新 Token" else "新学校密码", model.secret, { model.secret = it }, enabled, password = true)
                Button(onClick = { model.review(AccountWrite.UPDATE, id) }, enabled = enabled) { Text("确认更新…") }
                TextButton(onClick = model::clearTransient) { Text("取消并清空") }
            }
        } }
    }
}

@Composable
private fun AccountJobs(state: AccountState, model: AccountModel, enabled: Boolean) {
    Text("任务", style = MaterialTheme.typography.titleLarge)
    if (model.jobs.isEmpty()) Text("暂无任务")
    model.jobs.forEach { row -> OutlinedButton(onClick = { state.job(row.text("id")) }, enabled = enabled) { Text("${accountPurpose(row.text("tool_id"))} · ${cabinStatus(row.text("state"), row.text("tool_id"))}\n${row.text("id")}") } }
    model.job?.takeIf { model.route == "job" }?.let { row ->
        Text("任务详情", style = MaterialTheme.typography.titleMedium)
        Text(accountJobDetails(row))
        Text(accountReceipt(row["receipt"] ?: JsonNull))
        OutlinedButton(onClick = { model.review(AccountWrite.CANCEL, row.text("id")) }, enabled = enabled && row.text("state") !in setOf("succeeded", "failed", "cancelled")) { Text("取消此任务…") }
    }
}
