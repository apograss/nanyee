package de.nanyee.app

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
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
import androidx.compose.ui.semantics.Role
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
    var section by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf("") }
    BackHandler(section.isNotEmpty()) { section = "" }
    val profile = account.model?.user
    val name = if (school.demo) "演示同学" else profile?.text("nickname").orEmpty().ifBlank { profile?.text("username").orEmpty() }.ifBlank { "你好，同学" }
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (section.isEmpty()) ProfileHero(name, if (school.demo) "2026000001" else if (school.loggedIn) school.account else "未登录", Icons.Outlined.AccountCircle)
        if (section.isEmpty()) {
            Text("账号", style = MaterialTheme.typography.labelLarge, color = AppMuted)
            CompactEntry("学校账号", if (school.demo) "演示账号" else if (school.loggedIn) "已登录 · ${school.account}" else "未登录", Icons.Outlined.School, SectionAccent.ACADEMIC) { section = "school" }
            CompactEntry("Nanyee 账号", profile?.text("username").orEmpty().ifBlank { "未登录" }, Icons.Outlined.AccountCircle, SectionAccent.BRAND) { section = "platform" }
        } else {
            TextButton(onClick = { section = "" }) { Text("返回我的") }
            if (section == "platform") AccountSection(state = account, demoOnly = school.demo)
            else if (!school.homeVisible) Login(school, embedded = true)
            else {
                Text("学校账号", style = MaterialTheme.typography.titleMedium)
                Text(if (school.demo) "演示账号" else if (school.cachedMode) "未登录 · 本机课表" else "已登录 · ${school.account}")
                if (!school.demo && school.loggedIn) Text("到期 ${school.expires}", style = MaterialTheme.typography.bodySmall)
                Button(onClick = school::logout) { Text(if (school.demo) "退出演示" else "退出并清除课表") }
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
    SectionHeading("Nanyee 账号", icon = Icons.Outlined.AccountCircle)
    if (state.initializationError.isNotBlank()) InlineError(state.initializationError) { state.open(demoOnly) }
    val model = state.model
    if (model == null) { Button(onClick = { state.open(demoOnly) }) { Text("打开平台账号") }; return }
    BackHandler(model.route.isNotEmpty() && !model.busy) { model.navigate("") }
    if (model.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
    if (model.error.isNotBlank()) InlineError(model.error)
    if (model.message.isNotBlank()) Text(model.message, color = MaterialTheme.colorScheme.primary)
    if (state.demo) {
        Text("演示验证码 123456 · 演示注册题选每题第二项", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    if (model.error.contains("请在网页完成验证")) AssistChip(onClick = { uri.openUri(if (model.route == "register") "https://nanyee.de/auth/register" else "https://nanyee.de/account") }, label = { Text("在网页完成验证") })
    if (model.route.isNotEmpty()) TextButton(onClick = { model.navigate("") }, enabled = enabled) { Text("返回 Nanyee 账号") }
    when {
        model.route == "reset" -> {
            Text("忘记平台密码", style = MaterialTheme.typography.titleLarge)
            AccountChallengeFields(model, reset = true, enabled)
        }
        model.route == "register" && model.user == null -> RegistrationFields(state, model, enabled)
        model.user == null -> {
            CabinField("平台用户名", model.username, { model.username = it }, enabled)
            CabinField("平台密码", model.password, { model.password = it }, enabled, password = true)
            Button(onClick = { model.review(AccountWrite.LOGIN) }, enabled = enabled) { Text("登录 Nanyee…") }
            FlowRow {
                TextButton(onClick = { model.navigate("register") }, enabled = enabled) { Text("注册账号") }
                TextButton(onClick = { model.navigate("reset") }, enabled = enabled) { Text("忘记密码") }
            }
        }
        else -> {
            val profile = requireNotNull(model.user)
            Text("@${profile.text("username")} · ${profile.text("nickname")}", style = MaterialTheme.typography.titleLarge)
            Text("邮箱：${profile.text("email").ifBlank { "未绑定" }} · ${if ((profile["email_verified"] as? JsonPrimitive)?.booleanOrNull == true) "已验证" else "未验证"}")
            when (model.route) {
                "email" -> {
                    AccountChallengeFields(model, reset = false, enabled)
                    if (profile.text("email").isNotBlank()) {
                        CabinField("当前平台密码（换绑或解绑）", model.password, { model.password = it }, enabled, password = true)
                        OutlinedButton(onClick = { model.review(AccountWrite.EMAIL_UNBIND) }, enabled = enabled) { Text("解绑邮箱…") }
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
            if (model.route.isEmpty()) {
                SectionHeading("提醒", "", Icons.Outlined.NotificationsNone, SectionAccent.SERVICE)
                if (model.notices.isEmpty()) Text("暂无提醒")
                model.notices.forEach { notice -> Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(notice.text("title"), style = MaterialTheme.typography.titleSmall)
                        Text(notice.text("message"))
                        if ((notice["dismissible"] as? JsonPrimitive)?.booleanOrNull == true) TextButton(onClick = { model.dismissNotice(notice.text("id")) }) { Text("本机关闭") }
                    }
                } }
            }
        }
    }
    model.pending?.let { action -> AlertDialog(onDismissRequest = model::dismissConfirmation, title = { Text("请确认") }, text = {
        Text("确认${action.kind.label}？")
    }, confirmButton = { TextButton(onClick = state::confirm) { Text("确认") } }, dismissButton = { TextButton(onClick = model::dismissConfirmation) { Text("取消") } }) }
    val window = accountActivity(LocalContext.current)?.window
    DisposableEffect(window, model.revealed.isNotEmpty()) {
        val wasSecure = window?.attributes?.flags?.and(WindowManager.LayoutParams.FLAG_SECURE) != 0
        if (model.revealed.isNotEmpty()) window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose { if (!wasSecure) window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE) }
    }
    if (model.revealed.isNotEmpty()) AlertDialog(onDismissRequest = model::hideSecret, title = { Text("托管秘密 · 仅屏幕显示") }, text = { Text(model.revealed, Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) }, confirmButton = { TextButton(onClick = model::hideSecret) { Text("关闭并清空") } })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun RegistrationFields(state: AccountState, model: AccountModel, enabled: Boolean) {
    val challenge = model.registration
    Text("注册 Nanyee 账号", style = MaterialTheme.typography.titleLarge)
    if (challenge != null && model.registrationVerified) {
        Text("已通过${challenge.method.label}验证，设置登录信息即可完成注册。", style = MaterialTheme.typography.bodyMedium, color = AppMuted)
        CabinField("用户名（2–24 位字母、数字或下划线）", model.username, { model.username = it.trim() }, enabled)
        CabinField("昵称（可选）", model.nickname, { model.nickname = it }, enabled)
        CabinField("密码（8–128 字符）", model.password, { model.password = it }, enabled, password = true)
        CabinField("再次输入密码", model.passwordAgain, { model.passwordAgain = it }, enabled, password = true)
        Button(onClick = { state.registration { register() } }, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("注册并登录") }
        return
    }
    Text("答几道小题或用教育邮箱验证，然后设置用户名和密码。", style = MaterialTheme.typography.bodyMedium, color = AppMuted)
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        RegistrationMethod.entries.filter { it.offered }.forEach { method -> FilterChip(selected = model.registerMethod == method, onClick = { model.chooseRegisterMethod(method) }, enabled = enabled, label = { Text(method.label) }) }
    }
    when (model.registerMethod) {
        RegistrationMethod.QUICK, RegistrationMethod.QUIZ -> if (challenge == null) {
            Text("答几道南医校园常识题即可注册，无需邮箱。", style = MaterialTheme.typography.bodySmall, color = AppMuted)
            Button(onClick = { state.registration { startRegistration() } }, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("开始答题") }
        } else {
            val answered = model.answers.count { it != null }
            Text("已答 $answered/${challenge.questions.size} · 答对 ${challenge.passScore} 题即通过", style = MaterialTheme.typography.labelLarge)
            challenge.questions.forEachIndexed { index, question ->
                Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.medium) {
                    Column(Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                        Text("${index + 1}. ${question.question}", Modifier.padding(horizontal = 16.dp, vertical = 4.dp), style = MaterialTheme.typography.titleSmall)
                        question.options.forEachIndexed { option, label ->
                            val selected = model.answers.getOrNull(index) == option
                            Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).selectable(selected = selected, enabled = enabled, role = Role.RadioButton) { model.answer(index, option) }.padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                RadioButton(selected = selected, onClick = null, enabled = enabled)
                                Text(label, Modifier.padding(start = 8.dp), style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                }
            }
            Button(onClick = { state.registration { verifyRegistration() } }, enabled = enabled && answered == challenge.questions.size, modifier = Modifier.fillMaxWidth()) { Text("提交答案") }
            TextButton(onClick = { state.registration { startRegistration() } }, enabled = enabled) { Text("换一套题") }
        }
        RegistrationMethod.EMAIL -> {
            Text("仅支持 .edu.cn 教育邮箱，验证码会发送到该邮箱。", style = MaterialTheme.typography.bodySmall, color = AppMuted)
            CabinField("教育邮箱", model.email, { model.email = it }, enabled)
            OutlinedButton(onClick = { state.registration { startRegistration() } }, enabled = enabled) { Text(if (challenge == null) "发送验证码" else "重新发送") }
            if (challenge != null) {
                CabinField("六位验证码", model.code, { model.code = it.filter(Char::isDigit).take(6) }, enabled)
                Button(onClick = { state.registration { verifyRegistration() } }, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("验证") }
            }
        }
    }
}

@Composable
private fun AccountChallengeFields(model: AccountModel, reset: Boolean, enabled: Boolean) {
    CabinField(if (reset) "已绑定的邮箱" else "要绑定的新邮箱", model.email, { model.email = it }, enabled)
    Button(onClick = { model.review(if (reset) AccountWrite.RESET_CODE else AccountWrite.EMAIL_CODE) }, enabled = enabled) { Text("发送 / 重发验证码…") }
    model.challenge?.let { challenge ->
        Text(challenge.maskedEmail, style = MaterialTheme.typography.bodySmall)
        CabinField("六位验证码", model.code, { model.code = it }, enabled)
        if (reset) CabinField("新平台密码（8–128 字符）", model.newPassword, { model.newPassword = it }, enabled, password = true)
        Button(onClick = { model.review(if (reset) AccountWrite.RESET_CONFIRM else AccountWrite.EMAIL_CONFIRM) }, enabled = enabled) { Text(if (reset) "确认重置密码…" else "确认绑定 / 换绑…") }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AccountCredentials(model: AccountModel, enabled: Boolean) {
    Text("托管凭据", style = MaterialTheme.typography.titleLarge)
    if (model.credentials.isEmpty()) Text("暂无托管凭据")
    model.credentials.forEach { row ->
        val id = row.text("id")
        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("${accountPurpose(row.text("purpose"))} · ${accountStatus(row.text("status"))}", style = MaterialTheme.typography.titleMedium)
            Text("有效期：${row.text("expires_at").ifBlank { "永久" }}")
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
