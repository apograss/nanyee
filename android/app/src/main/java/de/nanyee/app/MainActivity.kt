package de.nanyee.app

import android.os.Bundle
import android.content.Context
import android.content.res.Configuration
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.serialization.json.*
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun attachBaseContext(newBase: Context) {
        val config = Configuration(newBase.resources.configuration).apply { uiMode = (uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or Configuration.UI_MODE_NIGHT_YES }
        super.attachBaseContext(newBase.createConfigurationContext(config))
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(android.graphics.Color.rgb(18, 17, 28)), navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.rgb(18, 17, 28)))
        setContent {
            NanyeeTheme {
                Surface(Modifier.fillMaxSize()) { Nanyee(viewModel()) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Nanyee(state: SchoolState) {
    val evaluation: EvaluationState = viewModel(key = "manual-evaluation-live")
    val grab: CourseGrabState = viewModel(key = "course-grab-live")
    val grabDemo: CourseGrabState = viewModel(key = "course-grab-demo")
    var rainDemo by rememberSaveable { mutableStateOf(false) }
    val rainReal: RainState = viewModel(key = "rain-real")
    val rainFake: RainState = viewModel(key = "rain-demo")
    val rain = if (rainDemo) rainFake else rainReal
    var pendingRainHost by remember { mutableStateOf<RainHost?>(null) }
    val view = androidx.compose.ui.platform.LocalView.current
    DisposableEffect(view, grab.run.active, grabDemo.run.active) {
        view.keepScreenOn = grab.run.active || grabDemo.run.active
        onDispose { view.keepScreenOn = false }
    }
    LaunchedEffect(state.evaluationSessionIdentity) { grab.onSessionChanged(state.evaluationSessionIdentity) }
    LaunchedEffect(state.courseGrabOwnerIdentity) { grab.onOwnerChanged(state.courseGrabOwnerIdentity) }
    LaunchedEffect(state.evaluationSessionIdentity) { evaluation.onSessionChanged(state.evaluationSessionIdentity) }
    BackHandler(enabled = state.demo || state.loginInFlight || state.canReturnToCache) { if (state.demo) state.logout() else if (state.loginInFlight) state.cancelLogin() else state.returnToCache() }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) state.onResume() }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    var detailKind by rememberSaveable(state.sessionGeneration) { mutableStateOf("") }
    var detailIndex by rememberSaveable(state.sessionGeneration) { mutableIntStateOf(-1) }
    var detailDataIdentity by rememberSaveable(state.sessionGeneration) { mutableStateOf("") }
    val detailItems = if (detailKind == "course") state.courses else state.grades?.items("grades") ?: emptyList()
    val dataIdentity = if (detailKind == "course") state.courseDataIdentity else state.gradeDataIdentity
    val detail = if (!state.homeVisible) null else selectedDetail(detailDataIdentity, dataIdentity, detailIndex, detailItems)?.let { detailKind to it }
    val landscape = LocalConfiguration.current.screenWidthDp > LocalConfiguration.current.screenHeightDp
    val iconSize = (24 * LocalDensity.current.fontScale.coerceIn(1f, 1.35f)).dp
    val icons = listOf(Icons.Outlined.CalendarMonth, Icons.Outlined.School, Icons.Outlined.RateReview, Icons.Outlined.Widgets, Icons.Outlined.Person)
    val selectedIcons = listOf(Icons.Filled.CalendarMonth, Icons.Filled.School, Icons.Filled.RateReview, Icons.Filled.Widgets, Icons.Filled.Person)
    val subtitle = when (state.tab) {
        MainTab.TIMETABLE -> "${if (state.homeVisible) "第 ${state.week} 周 · " else ""}${state.today.format(DateTimeFormatter.ofPattern("M月d日 E", Locale.SIMPLIFIED_CHINESE))}"
        MainTab.CLASSROOM -> "CLASSROOM / 保持连接"
        MainTab.EVALUATION -> "FEEDBACK / 让改变发生"
        MainTab.TOOLS -> "TOOLKIT / 校园控制台"
        MainTab.MY -> "IDENTITY / 你的校园坐标"
    }
    val tabState = rememberSaveableStateHolder()
    var platformMenu by remember { mutableStateOf(false) }
    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = { if (state.tab != MainTab.TIMETABLE || !state.homeVisible) TopAppBar(expandedHeight = if (landscape) 56.dp else (64 * LocalDensity.current.fontScale.coerceIn(1f, 1.6f)).dp, colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background), title = { Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(state.tab.label, style = if (landscape) MaterialTheme.typography.titleLarge else MaterialTheme.typography.headlineLarge, maxLines = 1)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        } }, actions = {
            if (state.tab == MainTab.CLASSROOM) Box {
                IconButton(onClick = { platformMenu = true }) { Icon(Icons.Outlined.MoreHoriz, "课堂平台与服务器") }
                DropdownMenu(expanded = platformMenu, onDismissRequest = { platformMenu = false }) {
                    ClassroomPlatform.entries.forEach { platform -> DropdownMenuItem(text = { Text(platform.label) }, onClick = { state.selectClassroom(platform); platformMenu = false }, leadingIcon = { RadioButton(selected = state.classroomPlatform == platform, onClick = null) }) }
                    if (state.classroomPlatform == ClassroomPlatform.RAIN) {
                        HorizontalDivider()
                        RainHost.entries.forEach { host -> DropdownMenuItem(text = { Text(host.domain) }, enabled = rain.ready && !rain.busy && rain.lesson == null, onClick = { if (rain.host != host) pendingRainHost = host; platformMenu = false }, leadingIcon = { RadioButton(selected = rain.host == host, onClick = null) }) }
                    }
                }
            }
            if ((state.tab == MainTab.TIMETABLE || state.tab == MainTab.TOOLS && state.toolsRoute == "grades") && state.homeVisible && !state.demo) IconButton(onClick = { state.reload() }, enabled = !state.busy) { Icon(Icons.Outlined.Refresh, "刷新", Modifier.size(iconSize)) }
        }) },
        bottomBar = { if (!landscape) Surface(color = InkRaised, shape = RoundedCornerShape(30.dp), modifier = Modifier.navigationBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp), shadowElevation = 10.dp) {
            Row(Modifier.fillMaxWidth().padding(6.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
                MainTab.entries.forEach { tab ->
                    val active = state.tab == tab
                    Surface(onClick = { state.selectTab(tab) }, shape = RoundedCornerShape(24.dp), color = if (active) InkAccent else Color.Transparent, contentColor = if (active) InkBase else InkMuted, modifier = Modifier.weight(if (active) 1.8f else 1f).heightIn(min = 48.dp)) {
                        Row(Modifier.padding(horizontal = 6.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (active) selectedIcons[tab.ordinal] else icons[tab.ordinal], if (active) null else tab.label, Modifier.size(22.dp))
                            if (active) Text(tab.label, style = MaterialTheme.typography.labelLarge, maxLines = 1)
                        }
                    }
                }
            }
        } }
    ) { padding ->
        Row(Modifier.padding(padding).consumeWindowInsets(padding).fillMaxSize()) {
            if (landscape) NavigationRail(windowInsets = WindowInsets(0)) { MainTab.entries.forEach { tab -> NavigationRailItem(selected = state.tab == tab, onClick = { state.selectTab(tab) }, icon = { Icon(if (state.tab == tab) selectedIcons[tab.ordinal] else icons[tab.ordinal], tab.label) }) } }
        Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            if (state.autoLoggingIn) Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("正在自动登录…", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                TextButton(onClick = { state.returnToCache() }) { Text("取消") }
            } else if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (state.demo && !landscape && state.tab != MainTab.TIMETABLE) Text("DEMO / 离线示例 · 非真实学业记录", Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall, color = InkMuted)
            if (state.homeVisible && state.error.isNotEmpty()) ErrorCard(state)
            tabState.SaveableStateProvider(state.tab.ordinal) { when {
                state.cacheRevocationFailed -> Column(Modifier.padding(12.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("本机课表尚未安全清除", style = MaterialTheme.typography.titleLarge)
                    Text(state.error)
                    Button(onClick = { state.logout() }) { Text("重试退出并清除课表") }
                }
                !state.homeVisible && state.tab == MainTab.TIMETABLE -> Login(state)
                state.tab == MainTab.TIMETABLE -> Timetable(state) { detailKind = "course"; detailIndex = state.courses.indexOf(it); detailDataIdentity = state.courseDataIdentity }
                state.tab == MainTab.CLASSROOM -> ClassroomScreen(state, rain, rainDemo) { rainDemo = !rainDemo }
                state.tab == MainTab.EVALUATION -> EvaluationToolsScreen(state, evaluation)
                state.tab == MainTab.TOOLS -> ToolsScreen(state, grab, grabDemo) { detailKind = "grade"; detailIndex = state.grades?.items("grades")?.indexOf(it) ?: -1; detailDataIdentity = state.gradeDataIdentity }
                else -> MyScreen(state)
            } }
        }
        }
    }
    pendingRainHost?.let { host -> AlertDialog(onDismissRequest = { pendingRainHost = null }, title = { Text("请确认") }, text = { Text("切换到 ${host.domain}，将离开当前会话视图。不同服务器的加密 Cookie 与身份互不混用。") }, confirmButton = { TextButton(onClick = { rain.switchHost(host); pendingRainHost = null }) { Text("确认") } }, dismissButton = { TextButton(onClick = { pendingRainHost = null }) { Text("取消") } }) }
    detail?.let { (kind, item) -> AlertDialog(onDismissRequest = { detailIndex = -1 }, confirmButton = { TextButton(onClick = { detailIndex = -1 }) { Text("关闭") } }, title = { Text(item.text("name")) }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (kind == "course") {
                Text("周${"一二三四五六日".getOrNull(item.number("weekday") - 1)} · ${item.text("start_time")}–${item.text("end_time")}")
                Text("第 ${item.text("start_node")}–${item.text("end_node")} 节")
                Text("地点：${item.text("location").ifEmpty { "未提供" }}")
                Text("教师：${item.text("teachers").ifEmpty { "未提供" }}")
                Text(displayWeeks((item["weeks"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.intOrNull } ?: emptyList()))
            } else {
                Text("${item.text("semester")} · ${displayNumber(item.text("credits"))} 学分")
                Text("成绩 ${displayNumber(item.text("raw_score"))}    绩点 ${displayNumber(item.text("grade_point"))}")
                val rank = item["ranking"] as? JsonObject
                if (rank == null) Text("暂无排名与分布") else {
                    Text("课程排名 ${rank.text("course_rank")} / ${rank.text("course_total")}")
                    Text("教学班排名 ${rank.text("class_rank")} / ${rank.text("class_total")}")
                    Text("成绩分布", fontWeight = FontWeight.Bold)
                    val distribution = rank["distribution"]?.obj() ?: JsonObject(emptyMap())
                    val max = distribution.values.mapNotNull { (it as? JsonPrimitive)?.intOrNull }.maxOrNull()?.coerceAtLeast(1) ?: 1
                    listOf("lt60" to "<60", "s60to70" to "60–69", "s70to80" to "70–79", "s80to90" to "80–89", "gte90" to "≥90").forEach { (key, label) ->
                        Text("$label 分 · ${distribution.number(key)} 人", style = MaterialTheme.typography.labelMedium)
                        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(MaterialTheme.colorScheme.surfaceContainerHighest)) {
                            Box(Modifier.fillMaxWidth(distribution.number(key).toFloat() / max).fillMaxHeight().clip(RoundedCornerShape(3.dp)).background(MaterialTheme.colorScheme.primary))
                        }
                    }
                }
            }
        }
    }) }
}

@Composable
fun Login(state: SchoolState, embedded: Boolean = false) {
    Column(Modifier.widthIn(max = 480.dp).then(if (embedded) Modifier.fillMaxWidth() else Modifier.fillMaxSize().verticalScroll(rememberScrollState())).padding(horizontal = 12.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (state.error.isNotEmpty()) ErrorCard(state)
        Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.primaryContainer) { Icon(Icons.Outlined.School, null, Modifier.padding(18.dp).size(32.dp), tint = MaterialTheme.colorScheme.primary) }
        Text("学校登录", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text("连接校园，让学业一目了然。", color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(value = state.account, onValueChange = { state.updateAccount(it) }, label = { Text("学号") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = state.password, onValueChange = { state.password = it }, label = { Text("学校密码") }, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false), singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(value = state.captchaText, onValueChange = { state.captchaText = it }, label = { Text("验证码") }, singleLine = true, modifier = Modifier.weight(1f))
            val bitmap = remember(state.captcha) { runCatching { val bytes = Base64.decode(state.captcha?.text("image_base64") ?: "", Base64.DEFAULT); BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }.getOrNull() }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.width(104.dp).clickable(enabled = !state.busy) { state.refreshCaptcha() }) {
                Surface(shape = RoundedCornerShape(12.dp), color = Color(0xFFFAFAFA), contentColor = Color(0xFF333333)) { Box(Modifier.fillMaxWidth().height(48.dp).padding(6.dp), contentAlignment = Alignment.Center) {
                    if (bitmap != null) Image(bitmap, "验证码，点击刷新", Modifier.fillMaxSize().clip(RoundedCornerShape(6.dp))) else Icon(Icons.Outlined.Refresh, "加载验证码")
                } }
                Text("点击刷新", fontSize = (11 / LocalDensity.current.fontScale.coerceAtLeast(1f)).sp, maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = state.remember, onCheckedChange = { state.updateRemember(it) }); Text("记住学号和密码", style = MaterialTheme.typography.bodyMedium) }
        Button(onClick = { state.login() }, enabled = !state.busy && state.captcha != null && state.account.isNotBlank() && state.password.isNotEmpty() && state.captchaText.isNotBlank(), modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("登录学校系统") }
        Text(when { state.busy -> "正在连接学校系统…"; state.account.isBlank() -> "请输入学号"; state.password.isEmpty() -> "请输入学校密码"; state.captcha == null -> "验证码未加载，请点击刷新"; state.captchaText.isBlank() -> "请输入图中的验证码"; else -> state.hint.ifEmpty { "信息已填写，可以登录" } }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (state.hint.isNotEmpty() && state.captchaText.isBlank()) Text(state.hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        if (state.loginInFlight) TextButton(onClick = { state.cancelLogin() }) { Text("取消登录") }
        OutlinedButton(onClick = { state.startDemo() }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("演示模式") }
        TextButton(onClick = { state.selectTab(MainTab.TOOLS) }, modifier = Modifier.fillMaxWidth()) { Text("工具 · 学习舱预约（独立平台账号）") }
        Text("学校登录可能使其他设备的教务会话下线。会话仅存于内存；勾选后，学号和密码将在本机加密保存。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun ErrorCard(state: SchoolState) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer), modifier = Modifier.widthIn(max = 720.dp).fillMaxWidth()) {
        Row(Modifier.padding(start = 12.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(state.error, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            IconButton(onClick = { state.error = "" }) { Icon(Icons.Outlined.Close, "关闭错误提示") }
        }
    }
}

@Composable
fun Picker(label: String, options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)) { Text(options.firstOrNull { it.first == selected }?.second ?: label, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)); Icon(Icons.Outlined.ExpandMore, null, Modifier.size(18.dp)) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, modifier = Modifier.heightIn(max = 360.dp)) { options.forEach { (value, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { expanded = false; onSelect(value) }) } }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
fun Timetable(state: SchoolState, onCourse: (JsonObject) -> Unit) {
    var weeksDialog by remember { mutableStateOf(false) }
    var weeksInput by remember { mutableStateOf(state.totalWeeks.toString()) }
    var conflicts by remember(state.sessionGeneration) { mutableStateOf<List<JsonObject>?>(null) }
    var weekSheet by remember { mutableStateOf(false) }
    var now by remember { mutableStateOf(LocalTime.now(ZoneId.of("Asia/Shanghai"))) }
    LaunchedEffect(Unit) { while (true) { now = LocalTime.now(ZoneId.of("Asia/Shanghai")); delay(30000) } }
    val density = LocalDensity.current
    val fontScale = timetableFontScale(density.fontScale)
    val periodHeight = timetablePeriodHeight(fontScale).dp
    val periodWidth = (29 * fontScale.coerceAtLeast(1f)).dp
    CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
    Column(Modifier.widthIn(max = 900.dp).fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 14.dp, end = 4.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Column(Modifier.weight(1f)) {
                Text(state.today.format(DateTimeFormatter.ofPattern(if (fontScale > 1.2f) "M月d日" else "M月d日 E", Locale.SIMPLIFIED_CHINESE)), style = MaterialTheme.typography.headlineLarge.copy(fontSize = if (fontScale > 1.2f) 25.sp else 28.sp, fontFeatureSettings = "tnum"), maxLines = 1)
                if (fontScale > 1.2f) Text(state.today.format(DateTimeFormatter.ofPattern("EEEE", Locale.SIMPLIFIED_CHINESE)), style = MaterialTheme.typography.labelSmall, color = InkMuted)
            }
            AssistChip(onClick = { weekSheet = true }, label = { Text("第${state.week}周", maxLines = 1) }, trailingIcon = { Icon(Icons.Outlined.ExpandMore, null, Modifier.size(16.dp)) })
            IconButton(onClick = { if (state.demo) state.returnToCurrentWeek() else state.reload() }, enabled = !state.busy) { Icon(Icons.Outlined.Refresh, "刷新课表", Modifier.size(21.dp)) }
        }
        Text(when { state.demo -> "DEMO · 本机离线示例"; state.timetableUpdatedAt.isNotBlank() -> "本机 · 更新于 ${runCatching { DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.of("Asia/Shanghai")).format(Instant.parse(state.timetableUpdatedAt)) }.getOrDefault("—")}${if (state.cachedMode) " · 未登录" else ""}"; else -> "学校直连 · ${state.calendarHint.ifBlank { "就绪" }}" }, Modifier.padding(start = 16.dp, bottom = 8.dp), style = MaterialTheme.typography.labelSmall, color = InkMuted)
        val signal = timetableSignal(state.courses, state.currentWeek, state.today, now)
        Surface(color = InkRaised, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(7.dp).clip(RoundedCornerShape(50)).background(if (signal?.current == true) InkLive else InkAccent))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(if (signal == null) "TODAY / 今日已就绪" else if (signal.current) "NOW / 正在上课" else "NEXT / 下一堂", style = MaterialTheme.typography.labelSmall, color = if (signal?.current == true) InkLive else InkMuted)
                    Text(signal?.course?.text("name") ?: "今天没有待上的课，留点时间给自己。", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
                    if (signal != null) Text("${signal.course.text("location")} · ${signal.minutes}分钟后${if (signal.current) "下课" else "开始"}", style = MaterialTheme.typography.bodySmall, color = InkMuted)
                }
                Icon(if (signal?.current == true) Icons.Outlined.GraphicEq else Icons.Outlined.NorthEast, null, tint = if (signal?.current == true) InkLive else InkAccent, modifier = Modifier.size(21.dp))
            }
        }
        val active = state.courses.filter { (it["weeks"] as? JsonArray)?.any { w -> (w as? JsonPrimitive)?.intOrNull == state.week } == true }
        if (active.isEmpty()) Text(if (state.busy) "正在加载课表…" else "本周暂无课程", Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        val nodeTimes = periodStartTimes(state.courses)
        val endTimes = periodEndTimes(state.courses)
        val nodes = maxOf(nodeTimes.size, active.maxOfOrNull { it.number("end_node") } ?: nodeTimes.size)
        val monday = teachingWeekMonday(state.semesterStart, state.week)
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Spacer(Modifier.width(periodWidth))
            (1..7).forEach { day ->
                val date = monday?.plusDays(day.toLong() - 1)
                val today = date == state.today
                Column(Modifier.weight(1f).padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("周${"一二三四五六日"[day - 1]}", fontSize = 10.sp, lineHeight = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Surface(shape = RoundedCornerShape(12.dp), color = if (today) InkLive else Color.Transparent, contentColor = if (today) InkBase else InkText) {
                        Text(date?.dayOfMonth?.toString() ?: "—", Modifier.padding(horizontal = 7.dp, vertical = 3.dp), fontSize = 11.sp, lineHeight = 14.sp, fontWeight = if (today) FontWeight.Bold else FontWeight.Normal)
                    }
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxSize().pointerInput(state.semester) {
            var distance = 0f
            detectHorizontalDragGestures(
                onDragStart = { distance = 0f },
                onDragCancel = { distance = 0f },
                onHorizontalDrag = { change, amount -> change.consume(); distance += amount },
                onDragEnd = {
                    val selected = weekAfterSwipe(state.week, state.totalWeeks, distance, 64.dp.toPx())
                    if (selected != state.week) state.selectWeek(selected)
                }
            )
        }.verticalScroll(rememberScrollState()).padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Column(Modifier.width(periodWidth)) {
                (1..nodes).forEach { node -> Column(Modifier.height(periodHeight).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("$node", fontSize = 11.sp, lineHeight = 16.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(nodeTimes.getOrNull(node - 1) ?: "—", style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum", letterSpacing = 0.sp), fontSize = 8.sp, lineHeight = 11.sp, maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(endTimes.getOrNull(node - 1) ?: "—", style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum", letterSpacing = 0.sp), fontSize = 8.sp, lineHeight = 11.sp, maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } }
            }
            (1..7).forEach { day ->
                val isToday = monday?.plusDays(day.toLong() - 1) == state.today
                Box(Modifier.weight(1f).height(periodHeight * nodes).background(if (isToday) InkLive.copy(alpha = 0.035f) else Color.Transparent)) {
                    Canvas(Modifier.fillMaxSize()) { (1..nodes).forEach { row -> val y = periodHeight.toPx() * row; drawLine(InkHairline.copy(alpha = 0.45f), Offset(0f, y), Offset(size.width, y), 1.dp.toPx()) } }
                    CourseDay(active.filter { it.number("weekday") == day }, nodes, periodHeight, onCourse, { conflicts = it }, Modifier.fillMaxWidth())
                    val position = if (isToday) timetableNowPosition(nodeTimes, endTimes, now) else null
                    if (position != null) Box(Modifier.offset(y = periodHeight * position).fillMaxWidth()) {
                        HorizontalDivider(thickness = 2.dp, color = InkLive)
                        Text(now.format(DateTimeFormatter.ofPattern("HH:mm")), Modifier.offset(y = (-14).dp).background(InkBase).padding(horizontal = 2.dp), color = InkLive, style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum", fontSize = 8.sp, letterSpacing = 0.sp))
                    }
                }
            }
        }
    }
    if (weekSheet) ModalBottomSheet(onDismissRequest = { weekSheet = false }, containerColor = InkSurface) {
        Column(Modifier.fillMaxWidth().heightIn(max = 520.dp).verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("学期与周次", style = MaterialTheme.typography.headlineSmall)
            Picker("选择学期", state.semesters.map { it.text("code") to it.text("label") }, state.semester, state::selectSemester)
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("TEACHING WEEK", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = InkMuted)
                if (state.currentWeek != null) TextButton(onClick = { state.returnToCurrentWeek(); weekSheet = false }) { Text("回到本周") }
            }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                (1..state.totalWeeks).forEach { week -> FilterChip(selected = state.week == week, onClick = { state.selectWeek(week); weekSheet = false }, label = { Text("第${week}周") }) }
            }
            if (state.calendarHint.isNotBlank()) Text(state.calendarHint, style = MaterialTheme.typography.bodySmall, color = InkMuted)
            TextButton(onClick = { weeksInput = state.totalWeeks.toString(); weeksDialog = true }, enabled = !state.cachedMode) { Text("学期长度 · ${state.totalWeeks} 周") }
            Spacer(Modifier.height(12.dp))
        }
    }
    }
    conflicts?.let { entries -> AlertDialog(onDismissRequest = { conflicts = null }, title = { Text("重叠课程 · ${entries.size} 门") }, confirmButton = { TextButton(onClick = { conflicts = null }) { Text("关闭") } }, text = { Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) { entries.forEach { course -> OutlinedCard(onClick = { conflicts = null; onCourse(course) }, modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp)) { Text(course.text("name"), fontWeight = FontWeight.Bold); Text("${course.text("start_time")}–${course.text("end_time")} · ${course.text("location")}", style = MaterialTheme.typography.bodySmall) } } } } }) }
    if (weeksDialog) AlertDialog(onDismissRequest = { weeksDialog = false }, title = { Text("学期周数") }, text = { OutlinedTextField(weeksInput, { weeksInput = it }, label = { Text("1–30 周") }, isError = weeksInput.toIntOrNull() !in 1..30) }, confirmButton = { TextButton(onClick = { state.setWeeks(weeksInput.toInt()); weeksDialog = false }, enabled = weeksInput.toIntOrNull() in 1..30) { Text("确定") } }, dismissButton = { TextButton(onClick = { weeksDialog = false }) { Text("取消") } })
}

@Composable
fun Grades(state: SchoolState, onGrade: (JsonObject) -> Unit) {
    var selected by remember(state.sessionGeneration) { mutableStateOf("") }
    val allGrades = state.grades?.items("grades") ?: emptyList()
    val grades = allGrades.filter { selected.isEmpty() || it.text("semester") == selected }
    val summary = if (selected.isEmpty()) state.grades?.get("summary")?.obj() else gradeSummary(grades)
    val landscape = LocalConfiguration.current.screenWidthDp > LocalConfiguration.current.screenHeightDp
    val largeFont = LocalDensity.current.fontScale > 1.3f
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = if (landscape) 8.dp else 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            (listOf("") + allGrades.map { it.text("semester") }.filter { it.isNotEmpty() }.distinct().sortedDescending()).forEach { semester ->
                FilterChip(selected = selected == semester, onClick = { selected = semester }, label = { Text(semester.ifEmpty { "全部" }) })
            }
        }
        if (state.gradesLoading) Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Text("正在加载成绩…") }
        if (grades.isEmpty()) {
            if (!state.gradesLoading) {
                Text(if (state.error.isNotEmpty()) "成绩加载失败，请重试" else "暂无成绩", style = MaterialTheme.typography.titleMedium)
                if (!state.demo) OutlinedButton(onClick = { state.reload() }) { Text("重新加载") }
            }
            return@Column
        }
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("学业概览", style = MaterialTheme.typography.titleMedium)
                if (landscape) Text("加权平均绩点 ${displayNumber(summary?.text("weighted_gpa") ?: "")}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) else {
                    Text(displayNumber(summary?.text("weighted_gpa") ?: ""), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                    Text("加权平均绩点", style = MaterialTheme.typography.labelLarge)
                }
                HorizontalDivider()
                listOf("required_gpa" to "必修绩点", "average_score" to "平均分", "required_average_score" to "必修平均分", "total_credits" to "总学分", "total_courses" to "课程数", "failed_count" to "不及格").chunked(if (largeFont && !landscape) 1 else 2).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) { row.forEach { (key, label) -> Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) { Text(label, style = MaterialTheme.typography.labelMedium); Text(displayNumber(summary?.text(key) ?: ""), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) } } }
            } }
        }
        Text("课程成绩", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        grades.groupBy { it.text("semester") }.forEach { (semester, items) ->
            Text(semester.ifEmpty { "未指定学期" }, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge)
            items.forEach { grade -> Card(onClick = { onGrade(grade) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(grade.text("name"), fontWeight = FontWeight.SemiBold); Text("${displayNumber(grade.text("credits"))} 学分 · 绩点 ${displayNumber(grade.text("grade_point"))}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Text(displayNumber(grade.text("raw_score")), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } }
        }
        Text("成绩与排名仅存于内存，不存储、不上报。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
