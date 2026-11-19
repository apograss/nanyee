package de.nanyee.app

import android.Manifest
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.hypot
import kotlin.math.roundToInt

@Composable
internal fun XxtToolsScreen(onBack: () -> Unit) {
    var demo by rememberSaveable { mutableStateOf(false) }
    val real: XxtState = viewModel(key = "xuexitong-real")
    val fake: XxtState = viewModel(key = "xuexitong-demo")
    val state = if (demo) fake else real
    LaunchedEffect(state) { state.initialize(demo) }
    XxtScreen(state, onBack, onToggleDemo = { demo = !demo })
}

@Composable
private fun XxtScreen(state: XxtState, onBack: () -> Unit, onToggleDemo: () -> Unit) {
    val context = LocalContext.current
    var account by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var rememberPassword by rememberSaveable { mutableStateOf(false) }
    var cameraUri by rememberSaveable { mutableStateOf("") }
    var pendingPhoto by rememberSaveable { mutableStateOf("") }
    var pendingScan by rememberSaveable { mutableStateOf("") }
    var deviceError by remember { mutableStateOf("") }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { it?.let { uri -> pendingPhoto = uri.toString() } }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success -> if (success) pendingPhoto = cameraUri }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) try { camera.launch(Uri.parse(cameraUri)) } catch (_: Exception) { deviceError = "系统相机不可用，请改用相册。" }
        else deviceError = "未授予相机权限，可改用相册。"
    }
    val scanner = rememberLauncherForActivityResult(ScanContract()) { it.contents?.let { value -> pendingScan = value } }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true) state.locate() else deviceError = "需要精确定位权限，不接受手动坐标或模拟定位。"
    }
    LaunchedEffect(pendingPhoto, state.busy) { if (pendingPhoto.isNotBlank() && !state.busy) { val uri = Uri.parse(pendingPhoto); pendingPhoto = ""; state.importPhoto(uri) } }
    LaunchedEffect(pendingScan, state.busy) { if (pendingScan.isNotBlank() && !state.busy) { state.scanned(pendingScan); pendingScan = "" } }
    LaunchedEffect(state.user) { if (state.user != null) password = "" }
    val back = { if (!state.busy) { if (state.course != null) state.back() else onBack() } }
    BackHandler { if (state.qrLogin != null) state.stopQrLogin() else back() }
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = back, enabled = !state.busy) { Text(if (state.course == null) "返回工具" else if (state.activity == null) "返回课程" else "返回活动") }
        Text("学习通", style = MaterialTheme.typography.headlineMedium)
        Text(if (state.demo) "离线演示 · 不联网，不上传，不会真实签到" else "独立学习通会话 · 仅当前本人账号 · 不共享教务登录")
        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
        if (deviceError.isNotBlank()) Text(deviceError, color = MaterialTheme.colorScheme.error)
        if (state.message.isNotBlank()) Text(state.message, style = MaterialTheme.typography.titleMedium)
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("学习通账号", style = MaterialTheme.typography.titleLarge)
                val user = state.user
                if (user != null) {
                    Text("${user.name} · 仅本人账号")
                    TextButton(onClick = state::logout, enabled = !state.busy || state.qrLogin != null) { Text("退出并清除学习通数据") }
                } else if (!state.demo) {
                    OutlinedTextField(account, { account = it }, label = { Text("学习通账号") }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
                    OutlinedTextField(password, { password = it }, label = { Text("学习通密码") }, visualTransformation = PasswordVisualTransformation(), singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
                    Row { Checkbox(rememberPassword, { rememberPassword = it }, enabled = !state.busy); Text("加密保存凭据，过期时自动重新登录", Modifier.weight(1f).padding(top = 12.dp)) }
                    Button(onClick = { state.login(account, password, rememberPassword) }, enabled = !state.busy && account.isNotBlank() && password.isNotBlank()) { Text("密码登录") }
                    OutlinedButton(onClick = state::beginQrLogin, enabled = !state.busy) { Text("显示学习通登录二维码") }
                    Text("二维码由官方学习通 App 授权；授权后加密保留 Cookie，不保存密码。")
                } else Button(onClick = state::refresh, enabled = !state.busy) { Text("重新进入演示账号") }
                state.qrLogin?.let { qr ->
                    val bitmap = remember(qr) { BitmapFactory.decodeByteArray(qr.image, 0, qr.image.size) }
                    if (bitmap != null) Image(bitmap.asImageBitmap(), "用官方学习通扫码授权登录", Modifier.fillMaxWidth().height(240.dp), contentScale = ContentScale.Fit)
                    Text("等待授权中（最多 3 分钟）… 请用另一台设备显示或扫描此二维码。")
                    TextButton(onClick = state::stopQrLogin) { Text("取消二维码登录") }
                }
            }
        }
        TextButton(onClick = onToggleDemo, enabled = !state.busy) { Text(if (state.demo) "返回真实学习通" else "无账号体验离线演示") }
        if (state.user != null) {
            TextButton(onClick = state::refresh, enabled = !state.busy) { Text("只读刷新课程 / 活动") }
            val course = state.course; val activity = state.activity; val detail = state.detail
            if (course == null) {
                Text("我的课程", style = MaterialTheme.typography.titleLarge)
                if (state.loaded && state.courses.isEmpty()) Text("暂无学习通课程。")
                state.courses.forEach { row ->
                    Card(onClick = { state.selectCourse(row) }, modifier = Modifier.fillMaxWidth(), enabled = !state.busy) {
                        Column(Modifier.padding(16.dp)) { Text(row.name, style = MaterialTheme.typography.titleMedium); Text(row.teacher) }
                    }
                }
            } else if (activity == null) {
                Text(course.name, style = MaterialTheme.typography.titleLarge)
                Text("活动 · 进行中优先")
                if (state.loaded && state.activities.isEmpty()) Text("本课程暂无活动。")
                state.activities.forEach { row ->
                    val sign = row.type in setOf(2, 74)
                    Card(onClick = { state.selectActivity(row) }, modifier = Modifier.fillMaxWidth(), enabled = sign && row.ongoing && !state.busy) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(row.name, style = MaterialTheme.typography.titleMedium)
                            Text("${if (row.ongoing) "进行中" else "已结束"} · ${xxtActivityLabel(row)}")
                            Text("开始 ${xxtTime(row.start)}${if (row.end > 0) " · 结束 ${xxtTime(row.end)}" else ""}")
                            if (row.description.isNotBlank()) Text(row.description)
                            if (!sign) Text("本期仅支持签到和签退，其余活动请使用官方学习通。")
                        }
                    }
                }
            } else {
                Text(activity.name, style = MaterialTheme.typography.titleLarge)
                Text("${xxtActivityLabel(activity)} · ${xxtTime(activity.start)}")
                if (detail != null) {
                    if (detail.face) Text("此活动要求人脸签到，暂不支持。请使用官方学习通，不提供跳过或替代身份。", color = MaterialTheme.colorScheme.error)
                    else if (detail.signed) Text("当前本人账号已签到，无需再次提交。")
                    else if (detail.type !in setOf(0, 2, 3, 4, 5)) Text("暂不支持此签到类型，请使用官方学习通。")
                    else {
                        Text(xxtSignLabel(detail))
                        if (detail.photo) {
                            Text("照片仅在确认后上传至超星云盘；可使用系统相机或相册。")
                            OutlinedButton(onClick = {
                                try {
                                    val dir = File(context.cacheDir, "xxt_camera").apply { mkdirs() }
                                    cameraUri = FileProvider.getUriForFile(context, "${context.packageName}.xxt.photos", File(dir, "capture.jpg")).toString()
                                    cameraPermission.launch(Manifest.permission.CAMERA)
                                } catch (_: Exception) { deviceError = "系统相机不可用，请改用相册。" }
                            }, enabled = !state.busy && !state.completed) { Text("相机拍照") }
                            OutlinedButton(onClick = { gallery.launch("image/*") }, enabled = !state.busy && !state.completed) { Text("从相册选择照片") }
                            val bitmap = remember(state.photoPath) { if (state.photoPath.isBlank()) null else BitmapFactory.decodeFile(state.photoPath, BitmapFactory.Options().apply { inSampleSize = 4 }) }
                            if (bitmap != null) Image(bitmap.asImageBitmap(), "待上传的本人签到照片", Modifier.fillMaxWidth().heightIn(max = 240.dp), contentScale = ContentScale.Fit)
                        }
                        if (detail.type == 5) OutlinedTextField(state.code, state::updateCode, label = { Text(if (detail.codeLength > 0) "${detail.codeLength} 位签到码" else "签到码") }, singleLine = true, enabled = !state.busy && !state.completed, modifier = Modifier.fillMaxWidth())
                        if (detail.type == 3) XxtPattern(state.code, enabled = !state.busy && !state.completed, onChange = state::updateCode)
                        if (detail.type == 2) {
                            Button(onClick = { try { scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("扫描当前活动的签到二维码").setOrientationLocked(false).setBeepEnabled(false)) } catch (_: Exception) { deviceError = "扫码相机不可用，请检查相机权限。" } }, enabled = !state.busy && !state.completed) { Text("相机扫描签到二维码") }
                            if (state.qr.isNotBlank()) Text("已扫描二维码；提交前将校验活动编号。")
                            if (state.demo) TextButton(onClick = { state.scanned("https://mobilelearn.chaoxing.com/widget/sign/e?id=${activity.id}&enc=demo-only") }, enabled = !state.busy) { Text("使用离线演示二维码") }
                        }
                        if (detail.type == 4 || (detail.type in setOf(2, 3, 5) && detail.address.isNotBlank())) {
                            Text("活动地点：${detail.address.ifBlank { "活动未提供地址文本" }}${if (detail.range.isBlank()) "" else " · 范围 ${detail.range} 米"}")
                            Text("仅手机真实位置，BD-09 坐标；不允许手动编辑。请开启定位并选择精确权限。")
                            Button(onClick = { locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)) }, enabled = !state.busy && !state.completed) { Text("获取手机当前位置") }
                            state.position?.let { position ->
                                Text("已取得位置，精度约 ${position.accuracy.roundToInt()} 米。两分钟内有效。")
                                if (detail.latitude != null && detail.longitude != null) Text("距要求地点约 ${xxtDistance(position, detail.latitude, detail.longitude)} 米") else Text("活动未提供目标坐标，无法计算距离。")
                            }
                        }
                        if (detail.captcha) Text("该活动需要手动拼图验证；不会自动解题。")
                        Button(onClick = state::preview, enabled = !state.busy && !state.completed) { Text("预览并确认签到") }
                        Text("提交结果未知时不会自动重试，请先在官方学习通核验。")
                    }
                }
            }
        }
    }
    state.confirmation?.let { plan ->
        AlertDialog(onDismissRequest = state::dismissConfirmation, title = { Text("确认本人签到") }, text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("账号：${state.user?.name}（仅当前本人）\n课程：${plan.course.name}\n活动：${plan.activity.name}\n方式：${xxtSignLabel(plan.detail)}")
                if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
                if (plan.code.isNotBlank()) Text("${if (plan.detail.type == 3) "手势顺序" else "签到码"}：${plan.code}")
                if (plan.detail.photo) Text("将向超星 pan-yz 上传上方预览照片，然后提交签到。")
                if (plan.qr.isNotBlank()) Text("使用相机扫描的当前活动二维码。")
                plan.position?.let { Text("使用刚获取的真实位置（BD-09）：${"%.6f".format(it.latitude)}, ${"%.6f".format(it.longitude)}\n地址：${plan.detail.address.ifBlank { "当前位置" }}\n精度约 ${it.accuracy.roundToInt()} 米") }
                Text(if (state.demo) "离线演示：没有网络请求。" else "将改变当前账号的签到状态。请核对后提交，勿替他人签到。")
            }
        }, confirmButton = { Button(onClick = state::submit, enabled = !state.busy) { Text("确认提交") } }, dismissButton = { TextButton(onClick = state::dismissConfirmation) { Text("返回修改") } })
    }
    state.captcha?.let { XxtCaptchaDialog(it, state.busy, state.error, state::verifyCaptcha, state::reloadCaptcha, state::dismissCaptcha) }
}

internal fun xxtActivityLabel(activity: XxtActivity): String = when (activity.type) { 2 -> "签到 · ${xxtSignLabel(XxtSignDetail(activity.signType))}"; 74 -> "签退"; 5 -> "讨论"; 14 -> "问卷"; 23 -> "评分"; 42 -> "随堂练习"; 43 -> "投票"; 45 -> "通知"; else -> "其他活动（${activity.type}）" }
internal fun xxtSignLabel(detail: XxtSignDetail): String = when { detail.face -> "人脸签到 · 不支持"; detail.photo -> "拍照签到"; else -> when (detail.type) { 0 -> "普通签到"; 2 -> "二维码签到"; 3 -> "手势签到"; 4 -> "位置签到"; 5 -> "签到码签到"; else -> "待加载详情" } }
private fun xxtTime(millis: Long): String = if (millis <= 0) "时间未提供" else DateTimeFormatter.ofPattern("MM-dd HH:mm").withZone(ZoneId.systemDefault()).format(Instant.ofEpochMilli(millis))

internal fun xxtPatternAppend(pattern: String, next: Int): String {
    require(next in 1..9)
    if (next.digitToChar() in pattern) return pattern
    val previous = pattern.lastOrNull()?.digitToInt() ?: return "$next"
    val x1 = (previous - 1) % 3; val y1 = (previous - 1) / 3
    val x2 = (next - 1) % 3; val y2 = (next - 1) / 3
    val middle = if ((x1 + x2) % 2 == 0 && (y1 + y2) % 2 == 0) (y1 + y2) / 2 * 3 + (x1 + x2) / 2 + 1 else 0
    return pattern + (if (middle in 1..9 && middle != previous && middle != next && middle.digitToChar() !in pattern) "$middle" else "") + next
}

@Composable
private fun XxtPattern(code: String, enabled: Boolean, onChange: (String) -> Unit) {
    val currentChange by rememberUpdatedState(onChange)
    val color = MaterialTheme.colorScheme.primary
    var drawing by remember { mutableStateOf("") }
    Text("按 1–9 九宫格绘制手势，或依次轻点下方数字。手势：$code")
    Canvas(Modifier.fillMaxWidth().height(240.dp).pointerInput(enabled) {
        fun append(point: Offset) {
            val hit = (1..9).firstOrNull { n -> hypot((point.x - size.width * (((n - 1) % 3 + 0.5f) / 3)).toDouble(), (point.y - size.height * (((n - 1) / 3 + 0.5f) / 3)).toDouble()) < minOf(size.width / 7.0, size.height / 5.0) }
            if (hit != null) { drawing = xxtPatternAppend(drawing, hit); currentChange(drawing) }
        }
        if (enabled) detectDragGestures(onDragStart = { drawing = ""; append(it) }, onDrag = { change, _ -> append(change.position); change.consume() })
    }) {
        fun point(n: Int) = Offset(size.width * (((n - 1) % 3 + 0.5f) / 3), size.height * (((n - 1) / 3 + 0.5f) / 3))
        code.map(Char::digitToInt).zipWithNext().forEach { (a, b) -> drawLine(color, point(a), point(b), 5.dp.toPx()) }
        (1..9).forEach { n -> drawCircle(color.copy(alpha = if (n.digitToChar() in code) 1f else 0.3f), 12.dp.toPx(), point(n)) }
    }
    (0..2).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { (1..3).forEach { col -> val n = row * 3 + col; OutlinedButton(onClick = { onChange(xxtPatternAppend(code, n)) }, enabled = enabled) { Text("$n") } } } }
    TextButton(onClick = { onChange(""); drawing = "" }, enabled = enabled) { Text("清除手势") }
}

@Composable
private fun XxtCaptchaDialog(challenge: XxtCaptcha, busy: Boolean, error: String, verify: (Int) -> Unit, reload: () -> Unit, dismiss: () -> Unit) {
    var slider by remember(challenge) { mutableFloatStateOf(0f) }
    val background = remember(challenge) { BitmapFactory.decodeByteArray(challenge.background, 0, challenge.background.size)?.asImageBitmap() }
    val piece = remember(challenge) { BitmapFactory.decodeByteArray(challenge.piece, 0, challenge.piece.size)?.asImageBitmap() }
    val tint = MaterialTheme.colorScheme.primary
    AlertDialog(onDismissRequest = { if (!busy) dismiss() }, title = { Text("请手动完成拼图") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("观察缺口，拖动下方滑块使拼图对齐，再点击验证。此处没有自动识别。")
            if (error.isNotBlank()) Text(error, color = MaterialTheme.colorScheme.error)
            BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(2f)) {
                if (background != null) Image(background, "滑动拼图背景", Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
                if (piece != null) Image(piece, "手动移动的拼图片段", Modifier.offset(x = maxWidth * (slider / 320)).width(maxWidth * (56f / 320)).fillMaxHeight(), contentScale = ContentScale.FillBounds)
                if (background == null && challenge.token == "demo") Canvas(Modifier.fillMaxSize()) {
                    drawRect(tint.copy(alpha = 0.2f)); drawRect(tint.copy(alpha = 0.4f), Offset(size.width * ((125f + 8) * 264 / 280 / 320), size.height * 0.3f), Size(size.width * 0.16f, size.height * 0.4f))
                    drawRect(tint, Offset(size.width * slider / 320, size.height * 0.3f), Size(size.width * 0.16f, size.height * 0.4f))
                }
            }
            Slider(slider, { slider = it }, valueRange = 0f..264f, enabled = !busy)
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            TextButton(onClick = reload, enabled = !busy) { Text("换一张拼图") }
        }
    }, confirmButton = { Button(onClick = { verify(((slider * 280 / 264 - 8).coerceAtLeast(0f) * challenge.originalWidth / 320).roundToInt()) }, enabled = !busy && slider > 0) { Text("验证并返回确认摘要") } }, dismissButton = { TextButton(onClick = dismiss, enabled = !busy) { Text("取消") } })
}
