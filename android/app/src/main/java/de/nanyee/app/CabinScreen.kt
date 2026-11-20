package de.nanyee.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudQueue
import androidx.compose.material.icons.outlined.EventSeat
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
    var opened by rememberSaveable { mutableStateOf(onBack != null) }
    var demoChoice by rememberSaveable { mutableStateOf(false) }
    var action by remember { mutableStateOf<Pair<String, String>?>(null) }
    val uri = LocalUriHandler.current
    val sessionRevision by PlatformSession.revision.collectAsState()
    LaunchedEffect(opened, school.demo, demoChoice, sessionRevision) { if (opened) state.open(school.demo || demoChoice, evaluationMode) }
    DisposableEffect(state) { onDispose { state.cancelCredential(); state.platformPassword = "" } }
    BackHandler(opened) { state.cancelCredential(); if (onBack != null) onBack() else opened = false }
    if (!opened) {
        Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("校园工具", style = MaterialTheme.typography.headlineMedium)
            Text("按需开启，让日常更从容。", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Card(onClick = { opened = true }, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("学习舱预约", style = MaterialTheme.typography.titleLarge)
                    Text("选择舱位优先级，交给服务器按时尝试预约。")
                    Text("需要独立的 Nanyee 平台账号", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        return
    }
    PullToRefreshBox(isRefreshing = state.busy, onRefresh = { if (state.user != null) state.refresh() }, modifier = Modifier.widthIn(max = 720.dp).fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            TextButton(onClick = { state.cancelCredential(); if (onBack != null) onBack() else opened = false }) { Text(if (evaluationMode) "返回课程评价" else "返回工具") }
            SectionHeading(if (evaluationMode) "自动评课" else "自习舱预约", "Nanyee 服务器 · 托管前需明确同意", if (evaluationMode) Icons.Outlined.CloudQueue else Icons.Outlined.EventSeat)
            if (state.demo) Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) { Text("演示模式 · 不联网、不托管真实密码、不执行真实操作", Modifier.padding(12.dp)) }
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (state.error.isNotBlank()) Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) { Text(state.error, Modifier.padding(12.dp)) }
            if (state.message.isNotBlank()) Text(state.message, color = MaterialTheme.colorScheme.primary)
            if (state.user == null) {
                Text("Nanyee 平台账号", style = MaterialTheme.typography.titleLarge)
                Text("与学校登录相互独立。学校密码只在您明确同意托管后发送给 nanyee.de。")
                if (state.demo) {
                    Button(onClick = { state.username = "demo"; state.platformPassword = "demo-only"; state.login() }, enabled = !state.busy) { Text("进入演示账号") }
                } else {
                    CabinField("平台用户名", state.username, { state.username = it }, !state.busy)
                    CabinField("平台密码", state.platformPassword, { state.platformPassword = it }, !state.busy, password = true)
                    Button(onClick = { state.login() }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("登录 Nanyee") }
                    TextButton(onClick = { uri.openUri("https://nanyee.de") }) { Text("去 nanyee.de 注册") }
                    Text("需要人机验证时，请稍后重试或前往网站操作。", style = MaterialTheme.typography.bodySmall)
                }
                if (!school.demo) OutlinedButton(onClick = { demoChoice = !state.demo; state.open(demoChoice, evaluationMode) }, enabled = !state.busy) { Text(if (state.demo) "返回真实平台登录" else "无账号体验演示") }
            } else {
                Text("${state.user?.text("nickname")?.ifBlank { "Nanyee 用户" }} · ${if (state.demo) "演示平台" else "nanyee.de"}", style = MaterialTheme.typography.titleMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { state.refresh() }, enabled = !state.busy) { Text(if (evaluationMode) "刷新评课" else "刷新预约") }
                    TextButton(onClick = { action = "logout" to "" }, enabled = !state.busy) { Text("退出平台账号") }
                }
                Text("托管学校凭据", style = MaterialTheme.typography.titleLarge)
                if (evaluationMode) state.notices.filter { it.text("kind") == "credential_invalid" }.forEach { notice ->
                    Text(notice.text("title") + "\n" + notice.text("message"), color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = { state.editCredential(notice.text("credential_id").takeIf { id -> state.credentials.any { it.text("id") == id } }) }, enabled = !state.busy) { Text("更新评课凭据") }
                }
                state.credentials.forEach { credential ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                if (state.credentials.isEmpty()) Text(if (evaluationMode) "尚无评课凭据。拒绝托管不会影响课表、成绩或手动评课。" else "尚无学习舱凭据。拒绝托管不会影响课表或成绩。")
                OutlinedButton(onClick = { state.editCredential() }, enabled = !state.busy && state.pending == null) { Text("添加托管凭据") }
                if (state.credentialEditor) {
                    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(if (state.editingId == null) "同意托管学校密码" else "更新托管学校密码", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            if (state.editingId != null) {
                                Text(state.credentials.firstOrNull { it.text("id") == state.editingId }?.get("metadata")?.obj()?.text("account_hint").orEmpty().ifBlank { "已托管的学校账号" })
                                Text("仅修改原账号密码。请填写与上方账号提示相符的学校学号；可从本机已记住的凭据预填，不读取服务器托管秘密。更换学校账号请先撤销原凭据，关联的排队任务将取消，再添加新凭据。")
                            }
                            Text(if (evaluationMode) "学校账号与密码将加密存储在 nanyee.de，用于您离线时无人值守地提交课程评价。凭据长期保存，可随时撤销。撤销会影响引用它的任务。只有点击同意后，才读取本机已记住的学校凭据来预填。" else "学校账号与密码将加密存储在 nanyee.de，用于您离线时无人值守预约学习舱。凭据长期保存，可随时撤销。撤销会影响引用它的任务。只有点击同意后，才读取本机已记住的学校凭据来预填。")
                            if (!state.consent) Button(onClick = { state.agree(school::hostedSchoolPrefill) }, enabled = !state.busy) { Text("同意并继续") }
                            else {
                                CabinField("学校学号", state.account, { state.account = it }, !state.busy)
                                CabinField("学校密码", state.schoolPassword, { state.schoolPassword = it }, !state.busy, password = true)
                                Button(onClick = { state.saveCredential() }, enabled = !state.busy, modifier = Modifier.fillMaxWidth()) { Text("提交托管凭据") }
                            }
                            TextButton(onClick = { state.cancelCredential() }, enabled = !state.busy) { Text("取消并清空") }
                        }
                    }
                }
                HorizontalDivider()
                Text(if (evaluationMode) "常驻自动评课任务" else "新建预约", style = MaterialTheme.typography.titleLarge)
                when {
                    state.pending != null -> {
                        Text("上次提交尚未确认。请先刷新核对；网络重试将沿用同一确认内容与幂等键，不会另建一笔。")
                        Button(onClick = { state.sendPending() }, enabled = !state.busy) { Text("使用原确认重试") }
                        OutlinedButton(onClick = { state.reconcilePending() }, enabled = !state.busy) { Text("刷新核对并放弃重试") }
                        if (state.canDiscardPending) TextButton(onClick = { state.discardPending() }, enabled = !state.busy) { Text("确认放弃本机待确认请求") }
                    }
                    state.submitted -> {
                        Text("任务已创建，请在下方查看进度。")
                        OutlinedButton(onClick = { state.newBooking() }, enabled = !state.busy) { Text(if (evaluationMode) "返回任务设置" else "再预约一笔") }
                    }
                    else -> if (evaluationMode) {
                        Text("按偏高随机档位逐门提交。首次立即执行，之后每日随机运行（服务器默认北京时间 21:10–23:30，可由管理员配置）。默认持续 180 天；服务器只保留一个常驻任务。")
                        CabinField("每轮最多课程数（1–60）", state.maxCourses, { state.maxCourses = it }, !state.busy)
                        CabinField("截止时间（可空，须带时区）", state.retryUntil, { state.retryUntil = it }, !state.busy)
                        Button(onClick = { state.reviewEvaluation() }, enabled = !state.busy && state.selectedCredential.isNotEmpty()) { Text("查看评课确认摘要") }
                    } else CabinBookingForm(state)
                }
                HorizontalDivider()
                Text(if (evaluationMode) "我的评课任务" else "我的预约", style = MaterialTheme.typography.titleLarge)
                Text(if (evaluationMode) "下拉或点击刷新查看常驻任务与最近一轮收据。" else "下拉或点击刷新查看最新状态。最多展示最近 100 个任务中的学习舱预约。", style = MaterialTheme.typography.bodySmall)
                if (state.jobs.isEmpty()) Text(if (evaluationMode) "还没有自动评课任务。" else "还没有学习舱预约。")
                state.jobs.forEach { job ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
                Text(if (evaluationMode) "自动评课由 nanyee.de 服务器执行；手机关闭后仍会继续。取消任务不会撤回已提交的评价。" else "预约由 nanyee.de 服务器执行，手机不连接学校 infospace。服务器仍需校验实时可用性，创建任务不等于预约成功。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    state.confirmation?.let { submission ->
        val payload = submission.body["payload"]!!.obj()
        AlertDialog(onDismissRequest = { state.dismissConfirmation() }, title = { Text(if (evaluationMode) "确认自动评课" else "确认预约任务") }, text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (evaluationMode) Text("自动评课：偏高随机档位\n每轮最多 ${payload.number("max_courses")} 门\n截止：${payload.text("retry_until").ifBlank { "创建后 180 天" }}") else Text("${payload.text("title")}\n${payload.text("target_date")}\n${payload.text("start_time")}–${payload.text("end_time")}")
                if (!evaluationMode) Text("优先级：\n" + state.draft.cabins.mapIndexed { index, id -> "${index + 1}. ${state.cabins.firstOrNull { it.number("dev_id") == id }?.text("name").orEmpty()}" }.joinToString("\n"))
                Text("使用凭据：" + state.credentials.firstOrNull { it.text("id") == submission.body.text("credential_id") }?.get("metadata")?.obj()?.text("account_hint").orEmpty())
                if (!evaluationMode) Text("首次尝试：${cabinDisplayMoment(submission.body.text("scheduled_for"))}\n停止尝试：${cabinDisplayMoment(payload.text("attempt_until"))}\n均为北京时间。")
                Text(if (state.demo) "演示模式，不会真正预约或评课。确认后仅创建本机演示任务。" else if (evaluationMode) "确认后服务器将无人值守地提交真实课程评价，可随时取消常驻任务。请核对策略和凭据。" else "确认后服务器将使用托管凭据尝试真实预约，直到成功或停止时间。")
            }
        }, confirmButton = { TextButton(onClick = { state.confirm() }, enabled = !state.busy) { Text("确认并创建") } }, dismissButton = { TextButton(onClick = { state.dismissConfirmation() }) { Text("返回修改") } })
    }
    action?.let { (kind, id) ->
        AlertDialog(onDismissRequest = { action = null }, title = { Text(when (kind) { "cancel" -> if (evaluationMode) "取消常驻评课任务？" else "取消预约任务？"; "revoke" -> "撤销托管凭据？"; else -> "退出平台账号？" }) }, text = { Text(when (kind) { "cancel" -> "正在执行的任务可能已提交，请刷新并核验收据。"; "revoke" -> "撤销后无法继续使用，引用此凭据的排队或等待重试任务将取消。正在执行的操作请另行核验。"; else -> "清除本机平台 Cookie，不影响学校课表缓存。" }) }, confirmButton = {
            TextButton(onClick = { action = null; when (kind) { "cancel" -> state.cancelJob(id); "revoke" -> state.revoke(id); else -> state.logout() } }, enabled = !state.busy) { Text("确认") }
        }, dismissButton = { TextButton(onClick = { action = null }) { Text("返回") } })
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CabinBookingForm(state: CabinState) {
    val enabled = !state.busy
    CabinField("预约日期 yyyy-MM-dd", state.draft.date, { state.draft = state.draft.copy(date = it) }, enabled)
    CabinTime("开始", state.draft.start, { state.draft = state.draft.copy(start = it) }, enabled)
    CabinTime("结束", state.draft.end, { state.draft = state.draft.copy(end = it) }, enabled)
    Text("08:00–22:50 · 10 分钟粒度 · 30–240 分钟", style = MaterialTheme.typography.bodySmall)
    CabinField("预约标题", state.draft.title, { state.draft = state.draft.copy(title = it) }, enabled)
    Text("舱位优先级", style = MaterialTheme.typography.titleMedium)
    if (state.cabins.isEmpty()) Text("暂无可选舱位，请刷新。")
    state.draft.cabins.forEachIndexed { index, id ->
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp)) {
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
    CabinMoment("首次尝试", state.draft.scheduled, { state.draft = state.draft.copy(scheduled = it) }, enabled)
    CabinMoment("停止尝试", state.draft.until, { state.draft = state.draft.copy(until = it) }, enabled)
    Text("全部使用北京时间。默认预约明天 09:00–11:00，从现在开始尝试，到明天 08:50 停止。未假定固定放号时间，可按学校公告修改。", style = MaterialTheme.typography.bodySmall)
    Button(onClick = { state.review() }, enabled = enabled && state.selectedCredential.isNotBlank(), modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("查看确认摘要") }
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
