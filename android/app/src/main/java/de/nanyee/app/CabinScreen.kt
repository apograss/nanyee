package de.nanyee.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudQueue
import androidx.compose.material.icons.outlined.EventSeat
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.serialization.json.*
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun CabinToolsScreen(school: SchoolState, state: CabinState = viewModel(), evaluationMode: Boolean = false, onBack: (() -> Unit)? = null) {
    var pane by rememberSaveable { mutableStateOf("new") }
    var opened by rememberSaveable { mutableStateOf(onBack != null) }
    var demoChoice by rememberSaveable { mutableStateOf(false) }
    var action by remember { mutableStateOf<Pair<String, String>?>(null) }
    val uri = LocalUriHandler.current
    val sessionRevision by PlatformSession.revision.collectAsState()
    LaunchedEffect(opened, school.demo, demoChoice, sessionRevision) { if (opened) state.open(school.demo || demoChoice, evaluationMode) }
    DisposableEffect(state) { onDispose { state.cancelCredential(); state.platformPassword = "" } }
    BackHandler(opened) { state.cancelCredential(); if (onBack != null) onBack() else opened = false }
    if (!opened) {
        Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("校园工具", style = MaterialTheme.typography.headlineMedium)
            Card(onClick = { opened = true }, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("学习舱预约", style = MaterialTheme.typography.titleLarge)
                }
            }
        }
        return
    }
    PullToRefreshBox(isRefreshing = state.busy, onRefresh = { if (state.user != null) state.refresh() }, modifier = Modifier.widthIn(max = 720.dp).fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            TextButton(onClick = { state.cancelCredential(); if (onBack != null) onBack() else opened = false }) { Text(if (evaluationMode) "返回课程评价" else "返回工具") }
            if (evaluationMode) SectionHeading("自动评课", icon = Icons.Outlined.CloudQueue)
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (state.error.isNotBlank()) InlineError(state.error)
            if (state.message.isNotBlank()) Text(state.message, color = MaterialTheme.colorScheme.primary)
            if (state.user == null) {
                Text("Nanyee 平台账号", style = MaterialTheme.typography.titleLarge)
                if (state.demo) {
                    Button(onClick = { state.username = "demo"; state.platformPassword = "demo-only"; state.login() }, enabled = !state.busy) { Text("进入演示账号") }
                } else {
                    CabinField("平台用户名", state.username, { state.username = it }, !state.busy)
                    CabinField("平台密码", state.platformPassword, { state.platformPassword = it }, !state.busy, password = true)
                    Button(onClick = { state.login() }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("登录 Nanyee") }
                    TextButton(onClick = { uri.openUri("https://nanyee.de") }) { Text("去 nanyee.de 注册") }
                }
                if (!school.demo) OutlinedButton(onClick = { demoChoice = !state.demo; state.open(demoChoice, evaluationMode) }, enabled = !state.busy) { Text(if (state.demo) "返回真实平台登录" else "无账号体验演示") }
            } else {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(state.user?.text("nickname").orEmpty().ifBlank { "Nanyee 用户" }, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { state.refresh() }, enabled = !state.busy) { Icon(Icons.Outlined.Refresh, "刷新任务") }
                    IconButton(onClick = { action = "logout" to "" }, enabled = !state.busy) { Icon(Icons.Outlined.Logout, "退出平台账号") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("new" to "新建", "jobs" to "任务", "credentials" to "凭据").forEach { (key, label) -> FilterChip(pane == key, { state.cancelCredential(); pane = key }, label = { Text(label) }) }
                }
                if (pane == "credentials") {
                    Text(if (state.demo) "模拟学校凭据" else "托管学校凭据", style = MaterialTheme.typography.titleLarge)
                    if (evaluationMode) state.notices.filter { it.text("kind") == "credential_invalid" }.forEach { notice ->
                        InlineError(notice.text("title"))
                        TextButton(onClick = { state.editCredential(notice.text("credential_id").takeIf { id -> state.credentials.any { it.text("id") == id } }) }, enabled = !state.busy) { Text("更新评课凭据") }
                    }
                    if (!state.credentialEditor) {
                        state.credentials.forEach { credential ->
                            Card(Modifier.fillMaxWidth()) {
                                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(credential["metadata"]?.obj()?.text("account_hint").orEmpty().ifBlank { "已托管的学校账号" })
                                    if (state.selectedCredential == credential.text("id")) Text("当前使用", color = MaterialTheme.colorScheme.primary)
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        TextButton(onClick = { state.selectedCredential = credential.text("id") }, enabled = !state.busy && state.pending == null) { Text("使用") }
                                        TextButton(onClick = { state.editCredential(credential.text("id")) }, enabled = !state.busy && state.pending == null) { Text("更新") }
                                        TextButton(onClick = { action = "revoke" to credential.text("id") }, enabled = !state.busy && state.pending == null) { Text("撤销") }
                                    }
                                }
                            }
                        }
                        if (state.credentials.isEmpty()) Text(if (state.demo) "暂无模拟凭据" else "暂无托管凭据")
                        OutlinedButton(onClick = { state.editCredential() }, enabled = !state.busy && state.pending == null) { Text(if (state.demo) "添加模拟凭据" else "添加托管凭据") }
                    }
                    if (state.credentialEditor) {
                        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                Text(if (state.demo) "本次演示的模拟凭据" else if (state.editingId == null) "同意托管学校密码" else "更新托管学校密码", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                if (state.editingId != null) {
                                    Text(state.credentials.firstOrNull { it.text("id") == state.editingId }?.get("metadata")?.obj()?.text("account_hint").orEmpty().ifBlank { "已托管的学校账号" })
                                }
                                Text(if (state.demo) "仅在本次演示中使用模拟凭据，\n不会上传到 nanyee.de。" else "同意将学校密码加密托管至 Nanyee，\n用于自动任务，可随时撤销。", style = MaterialTheme.typography.bodySmall)
                                if (!state.consent) Button(onClick = { state.agree(school::hostedSchoolPrefill) }, enabled = !state.busy) { Text(if (state.demo) "使用模拟凭据" else "同意并继续") }
                                else {
                                    CabinField(if (state.demo) "模拟学号" else "学校学号", state.account, { state.account = it }, !state.busy)
                                    CabinField(if (state.demo) "模拟密码" else "学校密码", state.schoolPassword, { state.schoolPassword = it }, !state.busy, password = true)
                                    Button(onClick = { state.saveCredential() }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text(if (state.demo) "添加模拟凭据" else "提交托管凭据") }
                                }
                                TextButton(onClick = { state.cancelCredential() }, enabled = !state.busy) { Text("取消并清空") }
                            }
                        }
                    }
                }
                if (pane == "new") {
                    if (state.selectedCredential.isBlank()) TextButton(onClick = { pane = "credentials"; state.editCredential() }) { Text("添加学校凭据") }
                    if (state.selectedCredential.isNotBlank() || state.pending != null || state.submitted) {
                        Text(if (evaluationMode) "自动评课设置" else "新建预约", style = MaterialTheme.typography.titleLarge)
                        when {
                            state.pending != null -> {
                                Text("提交结果待确认")
                                Button(onClick = { state.sendPending() }, enabled = !state.busy) { Text("使用原确认重试") }
                                OutlinedButton(onClick = { state.reconcilePending() }, enabled = !state.busy) { Text("刷新核对并放弃重试") }
                                if (state.canDiscardPending) TextButton(onClick = { state.discardPending() }, enabled = !state.busy) { Text("确认放弃本机待确认请求") }
                            }
                            state.submitted -> {
                                Text(if (state.demo) "模拟任务已创建" else "任务已创建")
                                OutlinedButton(onClick = { state.newBooking() }, enabled = !state.busy) { Text(if (evaluationMode) "返回任务设置" else "再预约一笔") }
                            }
                            else -> if (evaluationMode) {
                                CabinField("每轮最多课程数（1–60）", state.maxCourses, { state.maxCourses = it }, !state.busy)
                                CabinField("截止时间（可空，须带时区）", state.retryUntil, { state.retryUntil = it }, !state.busy)
                                Button(onClick = { state.reviewEvaluation() }, enabled = !state.busy && state.selectedCredential.isNotEmpty()) { Text("查看评课确认摘要") }
                            } else CabinBookingForm(state)
                        }
                    }
                }
                if (pane == "jobs") {
                    Text(if (evaluationMode) "我的评课任务" else "我的预约", style = MaterialTheme.typography.titleLarge)
                    if (state.jobs.isEmpty()) Text("暂无任务")
                    state.jobs.forEach { job ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Text(cabinStatus(job.text("state"), job.text("tool_id")), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                val payload = job["payload"]?.obj() ?: JsonObject(emptyMap())
                                if (!evaluationMode) Text(payload.text("title"))
                                if (evaluationMode) {
                                    evaluationNextRun(job)?.let { Text("下次运行：${cabinDisplayMoment(it)}") }
                                    evaluationFailure(job).takeIf { it.isNotBlank() }?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                                } else Text("${payload.text("target_date")}\n${payload.text("start_time")}–${payload.text("end_time")}")
                                if (!evaluationMode) Text("首次尝试：${cabinDisplayMoment(job.text("scheduled_for"))}", style = MaterialTheme.typography.bodySmall)
                                val receipt = job["receipt"] as? JsonObject
                                if (receipt != null) {
                                    if (evaluationMode) {
                                        Text("最近一轮：待评 ${receipt.number("pending_count")} · 已提交 ${receipt.number("submitted_count")}")
                                        evaluationRoundLogs(job).forEach { Text(it.text("message"), style = MaterialTheme.typography.bodySmall) }
                                    } else Text("预约收据\n${receipt.text("room_name")}\n${receipt.text("target_date")} ${receipt.text("start_time")}–${receipt.text("end_time")}")
                                }
                                if (job.text("state") == "verification_required" || job.text("next_action").isNotBlank()) Text(cabinNextAction(job.text("next_action"), job.text("tool_id")), color = MaterialTheme.colorScheme.error)
                                if (job.text("state") in listOf("queued", "running", "retry_wait")) OutlinedButton(onClick = { action = "cancel" to job.text("id") }, enabled = !state.busy) { Text(if (evaluationMode) "取消常驻评课" else "取消预约任务") }
                                if (state.demo) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    listOf("running", "retry_wait", "succeeded", "failed", "verification_required").forEach { status ->
                                        TextButton(onClick = { state.advanceDemo(job.text("id"), status) }, enabled = !state.busy) { Text("演示：${cabinStatus(status, job.text("tool_id"))}") }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    state.confirmation?.let { submission ->
        AlertDialog(onDismissRequest = { state.dismissConfirmation() }, title = { Text(if (evaluationMode) "确认自动评课" else "确认预约任务") }, text = {
            Text(if (state.demo) "创建演示任务？" else "确认授权服务器执行此任务？")
        }, confirmButton = { TextButton(onClick = { state.confirm() }, enabled = !state.busy) { Text("确认并创建") } }, dismissButton = { TextButton(onClick = { state.dismissConfirmation() }) { Text("返回修改") } })
    }
    action?.let { (kind, id) ->
        AlertDialog(onDismissRequest = { action = null }, title = { Text(if (state.demo) "确认本次演示操作？" else when (kind) { "cancel" -> if (evaluationMode) "取消常驻评课任务？" else "取消预约任务？"; "revoke" -> "撤销托管凭据？"; else -> "退出平台账号？" }) }, text = { Text(if (state.demo) "仅更改本次演示数据，不会发送至服务器。" else when (kind) { "cancel" -> "正在执行的任务可能已提交，请刷新并核验收据。"; "revoke" -> "撤销后将取消关联的排队任务。"; else -> "清除本机平台 Cookie，不影响学校课表缓存。" }) }, confirmButton = {
            TextButton(onClick = { action = null; when (kind) { "cancel" -> state.cancelJob(id); "revoke" -> state.revoke(id); else -> state.logout() } }, enabled = !state.busy) { Text("确认") }
        }, dismissButton = { TextButton(onClick = { action = null }) { Text("返回") } })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CabinBookingForm(state: CabinState) {
    var section by rememberSaveable { mutableIntStateOf(0) }
    val enabled = !state.busy
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("预约", "舱位", "执行").forEachIndexed { index, label -> FilterChip(section == index, { section = index }, label = { Text(label) }) }
    }
    when (section) {
        0 -> {
            CabinField("预约日期 yyyy-MM-dd", state.draft.date, { state.draft = state.draft.copy(date = it) }, enabled)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.weight(1f)) { CabinTime("开始", state.draft.start, { state.draft = state.draft.copy(start = it) }, enabled) }
                Box(Modifier.weight(1f)) { CabinTime("结束", state.draft.end, { state.draft = state.draft.copy(end = it) }, enabled) }
            }
            CabinField("预约标题", state.draft.title, { state.draft = state.draft.copy(title = it) }, enabled)
            TextButton(onClick = { section = 1 }) { Text("下一步") }
        }
        1 -> {
            Text("舱位优先级", style = MaterialTheme.typography.titleMedium)
            if (state.cabins.isEmpty()) Text("暂无可选舱位，请刷新。")
            state.draft.cabins.forEachIndexed { index, id ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("${index + 1}. ${state.cabins.firstOrNull { it.number("dev_id") == id }?.text("name").orEmpty()}")
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = { val ids = state.draft.cabins.toMutableList(); java.util.Collections.swap(ids, index, index - 1); state.draft = state.draft.copy(cabins = ids) }, enabled = enabled && index > 0) { Text("上移") }
                            TextButton(onClick = { val ids = state.draft.cabins.toMutableList(); java.util.Collections.swap(ids, index, index + 1); state.draft = state.draft.copy(cabins = ids) }, enabled = enabled && index < state.draft.cabins.lastIndex) { Text("下移") }
                            TextButton(onClick = { state.draft = state.draft.copy(cabins = state.draft.cabins - id) }, enabled = enabled) { Text("移除") }
                        }
                    }
                }
            }
            state.cabins.filter { it.number("dev_id") !in state.draft.cabins }.forEach { cabin ->
                OutlinedButton(onClick = { state.draft = state.draft.copy(cabins = state.draft.cabins + cabin.number("dev_id")) }, enabled = enabled && state.draft.cabins.size < 18, modifier = Modifier.fillMaxWidth()) { Text("添加 ${cabin.text("name")}") }
            }
            TextButton(onClick = { section = 2 }) { Text("下一步") }
        }
        2 -> {
            CabinMoment("首次尝试", state.draft.scheduled, { state.draft = state.draft.copy(scheduled = it) }, enabled)
            CabinMoment("停止尝试", state.draft.until, { state.draft = state.draft.copy(until = it) }, enabled)
            Button(onClick = { state.review() }, enabled = enabled && state.selectedCredential.isNotBlank(), modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("查看确认摘要") }
        }
    }
}

@Composable
internal fun CabinField(label: String, value: String, onChange: (String) -> Unit, enabled: Boolean, password: Boolean = false) {
    OutlinedTextField(value = value, onValueChange = onChange, label = { Text(label) }, enabled = enabled, singleLine = true, modifier = Modifier.fillMaxWidth(), visualTransformation = if (password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None, keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else KeyboardType.Text, autoCorrectEnabled = false))
}

@Composable
private fun CabinMoment(label: String, value: String, onChange: (String) -> Unit, enabled: Boolean) {
    val local = value.substringBefore('+')
    val date = local.substringBefore('T')
    val time = local.substringAfter('T', "")
    Text("$label · 北京时间", style = MaterialTheme.typography.titleMedium)
    CabinField("日期 yyyy-MM-dd", date, { onChange("${it}T$time+08:00") }, enabled)
    CabinField("时间 HH:mm", time, { onChange("${date}T$it+08:00") }, enabled)
}

@Composable
private fun CabinTime(label: String, value: String, onChange: (String) -> Unit, enabled: Boolean) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        OutlinedButton(onClick = { expanded = true }, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text("$label · $value") }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, modifier = Modifier.heightIn(max = 320.dp)) {
            (0..89).forEach { index ->
                val option = LocalTime.of(8, 0).plusMinutes(index * 10L).toString()
                DropdownMenuItem(text = { Text(option) }, onClick = { expanded = false; onChange(option) })
            }
            Spacer(Modifier.height(24.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()))
        }
    }
}

private fun cabinDisplayMoment(value: String): String = runCatching {
    OffsetDateTime.parse(value).atZoneSameInstant(cabinZone).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
}.getOrDefault(value)
