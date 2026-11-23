package de.nanyee.app

import androidx.compose.foundation.background

import android.Manifest
import android.app.Activity
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.ExpandLess
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.findViewTreeLifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
internal fun RainToolsScreen(state: RainState, demo: Boolean, onBack: () -> Unit, toggleDemo: () -> Unit) {
    LaunchedEffect(state) { state.initialize(demo) }
    val owner = LocalView.current.findViewTreeLifecycleOwner()
    val context = LocalContext.current
    val activity = remember(context) { generateSequence(context) { (it as? ContextWrapper)?.baseContext }.filterIsInstance<Activity>().firstOrNull() }
    DisposableEffect(owner, state) {
        state.setVisible(true)
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) state.setForeground(true)
            if (event == Lifecycle.Event.ON_PAUSE) state.setForeground(false, changingConfigurations = activity?.isChangingConfigurations == true)
        }
        owner?.lifecycle?.addObserver(observer)
        if (owner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true) state.setForeground(true)
        onDispose { owner?.lifecycle?.removeObserver(observer); state.setVisible(false, changingConfigurations = activity?.isChangingConfigurations == true) }
    }
    RainContent(state, onBack) { state.setForeground(false); toggleDemo() }
}

@Composable
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
private fun RainContent(state: RainState, onBack: () -> Unit, toggleDemo: () -> Unit) {
    var allCoursesExpanded by rememberSaveable(state.host, state.user?.id) { mutableStateOf(false) }
    val scroll = rememberScrollState()
    LaunchedEffect(state.lesson?.id) { scroll.scrollTo(0) }
    val context = LocalContext.current
    var deviceError by remember { mutableStateOf("") }
    var localConfirm by remember { mutableStateOf("") }
    val scanner = rememberLauncherForActivityResult(ScanContract()) { result -> result.contents?.let(state::previewScan) }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true) state.locate() else deviceError = "需要精确定位权限；不支持手动坐标或模拟定位。"
    }
    val galleryPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) state.confirm() else { state.dismiss(); deviceError = "未授予相册存储权限，没有保存图片。" }
    }
    val back = {
        if (!state.busy) {
            when { state.qr != null -> state.cancelQr(); state.lesson != null -> state.backToCourses(); else -> onBack() }
        }
    }
    BackHandler(onBack = back)
    PullToRefreshBox(isRefreshing = state.busy, onRefresh = { if (state.user != null) state.refreshClassroom() }, modifier = Modifier.widthIn(max = 920.dp).fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant)) {
    Column(Modifier.fillMaxSize().verticalScroll(scroll).padding(if (state.lesson == null) 16.dp else 0.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.lesson == null) {
            if (state.qr != null) TextButton(onClick = back, enabled = !state.busy) { Text("取消二维码登录") }
            ClassroomAccountRow(state.user?.name ?: "未登录雨课堂", "雨课堂", state.demo, !state.busy, state.user != null, { localConfirm = "logout" }, toggleDemo)
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (state.error.isNotBlank()) InlineError(state.error)
            if (deviceError.isNotBlank()) InlineError(deviceError)
            if (state.message.isNotBlank()) Text(state.message, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
            if (!state.ready && !state.busy) Button(onClick = { state.initialize(state.demo) }) { Text("重试打开加密存储") }
        }
        if (state.ready) {
            if (state.lesson == null && state.unknownKey.isNotBlank()) Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("提交结果未知", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { localConfirm = "unknown" }, enabled = !state.busy) { Text("已在官方核验结果…") }
                }
            }
            if (state.demo && state.lesson == null) {
                ScenarioPicker(state.scenario.label, RainDemoFailure.entries.map { it.label }, !state.busy) { state.selectScenario(RainDemoFailure.entries[it]) }
            }
            if (state.user == null || state.qr != null) {
                Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state.user != null) {
                        Text(state.user?.name.orEmpty())
                        TextButton(onClick = { localConfirm = "logout" }, enabled = !state.busy) { Text("退出并清除所有雨课堂本机数据…") }
                    } else {
                        RainLoginPanel(state)
                        if (state.demo) OutlinedButton(onClick = state::refresh, enabled = !state.busy) { Text("直接载入离线演示账号") }
                    }
                }
            }
            if (state.user != null) {
                if (state.lesson == null) {
                    Text("我的课程", style = MaterialTheme.typography.titleLarge)
                    val lists = rainCourseLists(state.courses, state.onLesson)
                    if (state.loaded && lists.live.isEmpty()) Text("暂无正在上的课")
                    lists.live.forEach { course ->
                        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                            Row(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.weight(1f)) { CourseHeading(course.name, rainCourseSubtitle(course), course.teacherAvatar) }
                                Column {
                                    state.onLesson.filter { it.courseId == course.id }.forEach { lesson ->
                                        TextButton(onClick = { state.previewJoin(lesson.lessonId, course.name) }, enabled = !state.busy && state.unknownKey.isBlank()) { Text("加入") }
                                    }
                                }
                            }
                        }
                    }
                    TextButton(onClick = { allCoursesExpanded = !allCoursesExpanded }, modifier = Modifier.fillMaxWidth()) {
                        Text("全部课程 (${state.courses.size})")
                        Icon(if (allCoursesExpanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, contentDescription = if (allCoursesExpanded) "收起" else "展开")
                    }
                    if (allCoursesExpanded) lists.remaining.forEach { course ->
                        Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                            Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) { CourseHeading(course.name, rainCourseSubtitle(course), course.teacherAvatar) }
                        }
                    }
                    OutlinedButton(onClick = {
                        try { scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("扫描当前服务器的雨课堂课堂码").setBeepEnabled(false).setOrientationLocked(false)) }
                        catch (_: Exception) { deviceError = "相机扫码不可用，请检查相机权限或从课程列表加入。" }
                    }, enabled = !state.busy && state.unknownKey.isBlank()) { Text("相机扫描课堂二维码…") }
                    if (state.demo) TextButton(onClick = { state.previewScan("https://${state.host.domain}/demo/lesson") }, enabled = !state.busy) { Text("演示课堂码") }
                    if (state.resolvedLesson.isNotBlank()) Button(onClick = { state.previewJoin(state.resolvedLesson, "刚刚解析的课堂") }, enabled = !state.busy && state.unknownKey.isBlank()) { Text("加入已扫描的课堂") }
                } else RainLessonContent(state, deviceError) { locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) }
            }
        }
    }
    }
    state.confirmation?.let { action ->
        AlertDialog(onDismissRequest = state::dismiss, title = { Text(if (action is RainAction.Export) "确认保存到本机相册" else "确认本人课堂操作") }, text = {
            Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(if (state.demo) "确认执行演示操作？" else "确认提交当前课堂操作？")
            }
        }, confirmButton = { TextButton(onClick = {
            if (action is RainAction.Export && Build.VERSION.SDK_INT < 29 && context.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) galleryPermission.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            else state.confirm()
        }) { Text("确认${if (action is RainAction.Export) "保存" else "提交"}") } }, dismissButton = { TextButton(onClick = state::dismiss) { Text("取消") } })
    }
    if (localConfirm.isNotBlank()) AlertDialog(onDismissRequest = { localConfirm = "" }, title = { Text("请确认") }, text = {
        Text(if (localConfirm == "unknown") "确认已在官方核验结果？" else "退出并清除雨课堂本机数据？")
    }, confirmButton = { TextButton(onClick = { if (localConfirm == "unknown") state.acknowledgeUnknown() else state.logout(); localConfirm = "" }) { Text("确认") } }, dismissButton = { TextButton(onClick = { localConfirm = "" }) { Text("取消") } })
}

@Composable
private fun RainLessonContent(state: RainState, deviceError: String, locate: () -> Unit) {
    val deck = state.presentation
    var more by rememberSaveable(state.lesson?.id) { mutableStateOf(false) }
    if (deck == null) Text("暂无课件") else {
        RainSlides(state)
    }
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (state.message.isNotBlank()) Text(state.message, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        if (state.error.isNotBlank()) InlineError(state.error)
        if (deviceError.isNotBlank()) InlineError(deviceError)
        if (state.unknownKey.isNotBlank()) Text("提交结果未知，请先在官方核验。", style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = { more = !more }, modifier = Modifier.fillMaxWidth()) {
            Text("更多", Modifier.weight(1f))
            Icon(if (more) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore, if (more) "收起" else "展开")
        }
        if (more) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { state.previewExport(false) }, enabled = !state.busy && state.currentSlide != null) { Text("保存本页") }
            OutlinedButton(onClick = { state.previewExport(true) }, enabled = !state.busy && state.currentSlide != null) { Text("保存全部") }
        }
        RainProblemContent(state)
        if (state.exporting) TextButton(onClick = state::cancelExport) { Text("停止保存（已保存 ${state.saved} 张）") }
        Text("真实位置签到", style = MaterialTheme.typography.titleLarge)
        AssistChip(onClick = state::refreshEligibility, enabled = !state.busy && !state.lessonFinished, label = { Text("刷新签到信息") })
        val eligible = state.eligibility
        if (eligible == null) Text("暂无签到信息") else {
            Text(if (eligible.signed) "已完成位置签到" else if (eligible.required) "当前要求位置签到" else "当前无需位置签到")
            if (eligible.address.isNotBlank()) Text("活动地点：${eligible.address}")
            if (eligible.required && !eligible.signed && !state.lessonFinished) {
                OutlinedButton(onClick = locate, enabled = !state.busy) { Text("获取当前位置") }
                state.position?.let { p -> Text("定位精度约 ${p.accuracy.toInt()} 米") }
                Button(onClick = state::previewLocation, enabled = !state.busy && state.position != null && state.unknownKey.isBlank()) { Text("预览位置签到…") }
            }
        }
        Text("课堂动态", style = MaterialTheme.typography.titleLarge)
        if (state.events.isEmpty()) Text("暂无直播事件。")
        state.events.asReversed().forEach { event ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val time = if (event.dt > 0) runCatching { Instant.ofEpochMilli(event.dt).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm:ss")) }.getOrDefault("") else "时间未提供"
                    Text("$time · ${event.title.ifBlank { event.type }}")
                    if (event.presentation.isNotBlank()) TextButton(onClick = { state.selectEvent(event) }, enabled = !state.busy) { Text("查看幻灯片") }
                }
            }
        }
    }
}

@Composable
private fun RainProblemContent(state: RainState) {
    val problem = state.problem ?: return
    val draft = state.draft
    val enabled = !state.busy && problem.supported && state.unlocked != null && !state.lessonFinished && state.unknownKey.isBlank()
    Text("课堂题目 · ${when (problem.type) { 1 -> "单选"; 2 -> "多选"; 3 -> "投票"; 4 -> "填空"; 5 -> "简答"; 6 -> "判断"; else -> "未知" }}", style = MaterialTheme.typography.titleLarge)
    Text(problem.body.ifBlank { "请结合幻灯片阅读题目。" })
    if (!problem.supported) Text("暂不支持此题型")
    else if (state.unlocked == null) Text("题目未开放")
    else {
        when (problem.type) {
            1, 2, 3, 6 -> {
                problem.options.forEach { option ->
                    val checked = option.key in draft.options
                    val multi = problem.maximum > 1
                    val choose = { state.updateDraft(draft.copy(options = if (!multi) listOf(option.key) else if (checked) draft.options - option.key else draft.options + option.key)) }
                    val allowed = enabled && (!multi || checked || draft.options.size < problem.maximum)
                    Row(Modifier.fillMaxWidth().then(if (multi) Modifier.toggleable(checked, enabled = allowed, role = Role.Checkbox, onValueChange = { choose() }) else Modifier.selectable(checked, enabled = allowed, role = Role.RadioButton, onClick = choose)), verticalAlignment = Alignment.CenterVertically) {
                        if (multi) Checkbox(checked, null, enabled = allowed) else RadioButton(checked, null, enabled = allowed)
                        Text("${option.key}. ${option.text}", Modifier.weight(1f))
                    }
                }
            }
            4 -> repeat(maxOf(1, problem.blanks)) { blank ->
                OutlinedTextField(draft.options.getOrNull(blank).orEmpty(), { text -> val values = MutableList(maxOf(1, problem.blanks)) { draft.options.getOrNull(it).orEmpty() }; values[blank] = text.take(5000); state.updateDraft(draft.copy(options = values)) }, label = { Text("手填第 ${blank + 1} 空") }, enabled = enabled, modifier = Modifier.fillMaxWidth())
            }
            5 -> OutlinedTextField(draft.text, { state.updateDraft(draft.copy(text = it.take(5000))) }, label = { Text("回答") }, enabled = enabled, modifier = Modifier.fillMaxWidth())
        }
        Button(onClick = { state.previewAnswer(false) }, enabled = enabled) { Text("预览正常作答…") }
        OutlinedButton(onClick = { state.previewAnswer(true) }, enabled = enabled) { Text("预览晚交 / 重试作答…") }

    }
}

internal fun rainConfirmation(action: RainAction): String = when (action) {
    is RainAction.Join -> "对「${action.title}」进行课堂签到，并在尚未加入时加入该课堂。课堂编号：${action.lessonId}。这会改变课堂参与状态。"
    is RainAction.Scan -> "把课堂码提交到当前雨课堂服务器（可能改变加入状态）。仅发送，不打开二维码地址。路径：${action.url.toHttpUrl().encodedPath}。解析后不会自动签到，仍需第二次确认加入。"
    is RainAction.Location -> "用手机实测 WGS84 坐标进行位置签到：${action.position.latitude}, ${action.position.longitude}；精度约 ${action.position.accuracy.toInt()} 米。活动地址说明：${action.eligibility.address}。不采用活动中心坐标，不支持手填或模拟定位。"
    is RainAction.Answer -> "${if (action.retry) "晚交 / 重试" else "正常"}作答：${action.problem.body}\n本人手写内容：${if (action.problem.type == 5) action.draft.text else action.draft.options.joinToString("；") { key -> action.problem.options.firstOrNull { it.key == key }?.let { "$key. ${it.text}" } ?: key }}"
    is RainAction.Export -> "将 ${action.slides.size} 页图片逐张保存到本机相册 Nanyee（Android 10+），超大图安全采样至最多约 400 万像素。保存中可停止，已保存图片不会撤回。不会向课堂提交信息。"
}
internal fun rainQrBitmap(content: String): Bitmap {
    val bits = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, 480, 480)
    return Bitmap.createBitmap(480, 480, Bitmap.Config.ARGB_8888).also { bitmap ->
        val pixels = IntArray(480 * 480) { index -> if (bits[index % 480, index / 480]) android.graphics.Color.BLACK else android.graphics.Color.WHITE }
        bitmap.setPixels(pixels, 0, 480, 0, 0, 480, 480)
    }
}
