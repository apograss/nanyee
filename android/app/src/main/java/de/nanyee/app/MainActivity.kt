package de.nanyee.app

import android.os.Bundle
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.compose.BackHandler
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
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
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val dark = isSystemInDarkTheme()
            MaterialTheme(colorScheme = if (dark) darkColorScheme(primary = Color(0xFF94D5C7), onPrimary = Color(0xFF00382E), primaryContainer = Color(0xFF155044), onPrimaryContainer = Color(0xFFB0F1E2), secondary = Color(0xFFBCCDC7), secondaryContainer = Color(0xFF344C45), onSecondaryContainer = Color(0xFFD5E9E1), background = Color(0xFF101513), surface = Color(0xFF101513)) else lightColorScheme(primary = Color(0xFF176B5B), onPrimary = Color.White, primaryContainer = Color(0xFFB0F1E2), onPrimaryContainer = Color(0xFF002019), secondary = Color(0xFF50655E), secondaryContainer = Color(0xFFD2E8DF), onSecondaryContainer = Color(0xFF10251E), background = Color(0xFFF7FAF8), surface = Color(0xFFF7FAF8))) {
                Surface(Modifier.fillMaxSize()) { Nanyee(viewModel()) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Nanyee(state: SchoolState) {
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
    val labels = listOf("课表", "成绩", "我的")
    val icons = listOf(Icons.Outlined.CalendarMonth, Icons.Outlined.BarChart, Icons.Outlined.Person)
    Scaffold(
        contentWindowInsets = WindowInsets.safeDrawing,
        topBar = { if (state.homeVisible) TopAppBar(expandedHeight = if (landscape) 44.dp else 64.dp, title = { Text(labels[state.tab] + if (landscape && state.demo) " · 演示模式" else "", fontWeight = FontWeight.Bold, style = if (landscape) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge, maxLines = 1) }, actions = { if (state.tab < 2 && !state.demo) IconButton(onClick = { state.reload() }, enabled = !state.busy) { Icon(Icons.Outlined.Refresh, "刷新", Modifier.size(iconSize)) } }) },
        bottomBar = { if (state.homeVisible && !landscape) NavigationBar { labels.forEachIndexed { i, label -> NavigationBarItem(selected = state.tab == i, onClick = { state.selectTab(i) }, icon = { Icon(icons[i], null) }, label = { Text(label) }) } } }
    ) { padding ->
        Row(Modifier.padding(padding).consumeWindowInsets(padding).fillMaxSize()) {
            if (landscape && state.homeVisible) NavigationRail(windowInsets = WindowInsets(0)) { labels.forEachIndexed { i, label -> NavigationRailItem(selected = state.tab == i, onClick = { state.selectTab(i) }, icon = { Icon(icons[i], label) }) } }
        Column(Modifier.weight(1f).fillMaxHeight(), horizontalAlignment = Alignment.CenterHorizontally) {
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (state.demo && !landscape) Surface(color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.fillMaxWidth()) { Text("演示模式 · 以下为示例数据，并非真实学业记录", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.labelMedium) }
            if (state.homeVisible && state.error.isNotEmpty()) ErrorCard(state)
            when {
                !state.homeVisible -> Login(state)
                state.tab == 0 -> Timetable(state) { detailKind = "course"; detailIndex = state.courses.indexOf(it); detailDataIdentity = state.courseDataIdentity }
                state.tab == 1 -> Grades(state) { detailKind = "grade"; detailIndex = state.grades?.items("grades")?.indexOf(it) ?: -1; detailDataIdentity = state.gradeDataIdentity }
                else -> Column(Modifier.widthIn(max = 520.dp).fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.primaryContainer) { Icon(Icons.Outlined.School, null, Modifier.padding(20.dp).size(36.dp)) }
                    Text("学校登录", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) { Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(if (state.demo) "当前处于演示模式" else if (state.cachedMode) "正在查看本机课表 · 未登录" else "已登录学校系统", color = MaterialTheme.colorScheme.primary)
                    if (!state.demo && state.loggedIn) Text("会话到期：${runCatching { DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.of("Asia/Shanghai")).format(Instant.parse(state.expires)) }.getOrDefault(state.expires)}（北京时间）")
                    Text("课表在本机加密保存；学校会话与成绩仅保存在内存中。", style = MaterialTheme.typography.bodyMedium)
                    } }
                    OutlinedButton(onClick = { state.logout() }, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Outlined.Logout, null); Spacer(Modifier.width(8.dp)); Text(if (state.demo) "退出演示模式" else "退出并清除本机课表") }
                }
            }
        }
        }
    }
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
fun Login(state: SchoolState) {
    Column(Modifier.widthIn(max = 480.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
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
                Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceContainerHighest) { Box(Modifier.fillMaxWidth().height(48.dp).padding(6.dp), contentAlignment = Alignment.Center) {
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
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 8.dp)) { Text(options.firstOrNull { it.first == selected }?.second ?: label, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f)); Icon(Icons.Outlined.ExpandMore, null, Modifier.size(18.dp)) }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }, modifier = Modifier.heightIn(max = 360.dp)) { options.forEach { (value, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { expanded = false; onSelect(value) }) } }
    }
}

@Composable
fun Timetable(state: SchoolState, onCourse: (JsonObject) -> Unit) {
    var weeksDialog by remember { mutableStateOf(false) }
    var weeksInput by remember { mutableStateOf(state.totalWeeks.toString()) }
    var conflicts by remember(state.sessionGeneration) { mutableStateOf<List<JsonObject>?>(null) }
    val density = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(density.density, density.fontScale.coerceAtMost(1.05f))) {
    Column(Modifier.widthIn(max = 1000.dp).fillMaxSize()) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Picker("选择学期", state.semesters.map { it.text("code") to it.text("label") }, state.semester, { state.selectSemester(it) }, Modifier.weight(1.6f))
                Picker("选择周次", (1..state.totalWeeks).map { it.toString() to "第 $it 周" }, state.week.toString(), { state.selectWeek(it.toInt()) }, Modifier.weight(1f))
                TextButton(onClick = { weeksInput = state.totalWeeks.toString(); weeksDialog = true }, contentPadding = PaddingValues(2.dp)) { Text("共 ${state.totalWeeks} 周", fontSize = 11.sp, maxLines = 1) }
        }
        if (!state.demo && state.timetableUpdatedAt.isNotEmpty()) Text(
            "${if (state.cachedMode) "本机课表 · 未登录 · " else ""}更新于 ${runCatching { DateTimeFormatter.ofPattern("MM-dd HH:mm").withZone(ZoneId.of("Asia/Shanghai")).format(Instant.parse(state.timetableUpdatedAt)) }.getOrDefault("—")}",
            Modifier.padding(horizontal = 16.dp, vertical = 2.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (state.currentWeek != null) "${if (state.demo) "示例校历 · " else ""}本周：第 ${state.currentWeek} 周" else state.calendarHint, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (state.currentWeek != null && state.week != state.currentWeek) TextButton(onClick = { state.returnToCurrentWeek() }) { Text("回到本周") }
        }
        val active = state.courses.filter { (it["weeks"] as? JsonArray)?.any { w -> (w as? JsonPrimitive)?.intOrNull == state.week } == true }
        if (active.isEmpty()) Text(if (state.busy) "正在加载课表…" else "本周暂无课程", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        val dark = isSystemInDarkTheme()
        val colors = if (dark) listOf(Color(0xFF244F47), Color(0xFF394563), Color(0xFF58452E), Color(0xFF503D55)) else listOf(Color(0xFFDCEFE7), Color(0xFFE4E9F9), Color(0xFFF8EBD4), Color(0xFFF1E3EF))
        val nodeTimes = periodStartTimes(state.courses)
        val nodes = maxOf(nodeTimes.size, active.maxOfOrNull { it.number("end_node") } ?: nodeTimes.size)
        val today = state.today.dayOfWeek.value
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Spacer(Modifier.width(36.dp))
            (1..7).forEach { day ->
                Box(Modifier.weight(1f).height(32.dp).clip(RoundedCornerShape(10.dp)).background(if (day == today) MaterialTheme.colorScheme.primaryContainer else Color.Transparent), contentAlignment = Alignment.Center) {
                    Text("周${"一二三四五六日"[day - 1]}", fontSize = 11.sp, fontWeight = if (day == today) FontWeight.Bold else FontWeight.Normal, color = if (day == today) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Column(Modifier.width(36.dp)) {
                (1..nodes).forEach { node -> Column(Modifier.height(64.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("$node", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(nodeTimes.getOrNull(node - 1) ?: "—", fontSize = 8.sp, maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } }
            }
            (1..7).forEach { day -> CourseDay(active.filter { it.number("weekday") == day }, state.courses, colors, nodes, onCourse, { conflicts = it }, Modifier.weight(1f)) }
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
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = if (landscape) 8.dp else 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
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
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("学业概览", style = MaterialTheme.typography.titleMedium)
                if (landscape) Text("加权平均绩点 ${displayNumber(summary?.text("weighted_gpa") ?: "")}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) else {
                    Text(displayNumber(summary?.text("weighted_gpa") ?: ""), style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.Bold)
                    Text("加权平均绩点", style = MaterialTheme.typography.labelLarge)
                }
                HorizontalDivider()
                listOf("required_gpa" to "必修绩点", "average_score" to "平均分", "required_average_score" to "必修平均分", "total_credits" to "总学分", "total_courses" to "课程数", "failed_count" to "不及格").chunked(if (largeFont && !landscape) 1 else 2).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) { row.forEach { (key, label) -> Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) { Text(label, style = MaterialTheme.typography.labelMedium); Text(displayNumber(summary?.text(key) ?: ""), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) } } }
            } }
        }
        Text("课程成绩", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        grades.groupBy { it.text("semester") }.forEach { (semester, items) ->
            Text(semester.ifEmpty { "未指定学期" }, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge)
            items.forEach { grade -> Card(onClick = { onGrade(grade) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(grade.text("name"), fontWeight = FontWeight.SemiBold); Text("${displayNumber(grade.text("credits"))} 学分 · 绩点 ${displayNumber(grade.text("grade_point"))}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Text(displayNumber(grade.text("raw_score")), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } }
        }
        Text("成绩与排名仅存于内存，不存储、不上报。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
