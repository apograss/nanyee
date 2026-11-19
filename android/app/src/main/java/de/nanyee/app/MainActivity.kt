package de.nanyee.app

import android.os.Bundle
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.serialization.json.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val dark = isSystemInDarkTheme()
            MaterialTheme(colorScheme = if (dark) darkColorScheme(primary = Color(0xFF94D5C7), secondary = Color(0xFFBCCDC7)) else lightColorScheme(primary = Color(0xFF176B5B), secondary = Color(0xFF50655E), background = Color(0xFFF7FAF8), surface = Color(0xFFF7FAF8))) {
                Surface(Modifier.fillMaxSize()) { Nanyee(viewModel()) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Nanyee(state: SchoolState) {
    var detail by remember(state.sessionGeneration) { mutableStateOf<Pair<String, JsonObject>?>(null) }
    Scaffold(
        topBar = { if (state.loggedIn) TopAppBar(title = { Text(listOf("课表", "成绩", "我的")[state.tab], fontWeight = FontWeight.Bold) }, actions = { if (state.tab < 2) IconButton(onClick = { state.reload() }, enabled = !state.busy) { Icon(Icons.Outlined.Refresh, "刷新") } }) },
        bottomBar = { if (state.loggedIn) NavigationBar { listOf("课表", "成绩", "我的").forEachIndexed { i, label -> NavigationBarItem(selected = state.tab == i, onClick = { state.tab = i }, icon = { Icon(listOf(Icons.Outlined.CalendarMonth, Icons.Outlined.BarChart, Icons.Outlined.Person)[i], null) }, label = { Text(label) }) } } }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
            if (state.demo) Surface(color = MaterialTheme.colorScheme.secondaryContainer, modifier = Modifier.fillMaxWidth()) { Text("演示模式 · 以下为示例数据，并非真实学业记录", Modifier.padding(horizontal = 20.dp, vertical = 10.dp), style = MaterialTheme.typography.labelMedium) }
            if (state.error.isNotEmpty()) Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer), modifier = Modifier.padding(16.dp).fillMaxWidth()) { Text(state.error, Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall); TextButton(onClick = { state.error = "" }) { Text("关闭") } }
            when {
                !state.loggedIn -> Login(state)
                state.tab == 0 -> Timetable(state) { detail = "course" to it }
                state.tab == 1 -> Grades(state) { detail = "grade" to it }
                else -> Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    Text("学校登录", style = MaterialTheme.typography.headlineSmall)
                    Text(if (state.demo) "当前处于演示模式" else "已登录学校系统", color = MaterialTheme.colorScheme.primary)
                    if (!state.demo) Text("会话到期：${runCatching { DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.of("Asia/Shanghai")).format(Instant.parse(state.expires)) }.getOrDefault(state.expires)}（北京时间）")
                    Text("学校会话与学业数据仅保存在内存中。", style = MaterialTheme.typography.bodyMedium)
                    OutlinedButton(onClick = { state.logout() }) { Text(if (state.demo) "退出演示模式" else "退出登录") }
                }
            }
        }
    }
    detail?.let { (kind, item) -> AlertDialog(onDismissRequest = { detail = null }, confirmButton = { TextButton(onClick = { detail = null }) { Text("关闭") } }, title = { Text(item.text("name")) }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (kind == "course") {
                Text("周${"一二三四五六日".getOrNull(item.number("weekday") - 1)} · ${item.text("start_time")}–${item.text("end_time")}")
                Text("第 ${item.text("start_node")}–${item.text("end_node")} 节")
                Text("地点：${item.text("location").ifEmpty { "未提供" }}")
                Text("教师：${item.text("teachers").ifEmpty { "未提供" }}")
                Text("周次：${(item["weeks"] as? JsonArray)?.joinToString("、") ?: "未提供"}")
            } else {
                Text("${item.text("semester")} · ${item.text("credits")} 学分")
                Text("成绩 ${item.text("raw_score")}    绩点 ${item.text("grade_point")}")
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
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.primaryContainer) { Icon(Icons.Outlined.School, null, Modifier.padding(18.dp).size(32.dp), tint = MaterialTheme.colorScheme.primary) }
        Text("学校登录", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        Text("连接校园，让学业一目了然。", color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(value = state.account, onValueChange = { state.account = it }, label = { Text("学号") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(value = state.password, onValueChange = { state.password = it }, label = { Text("学校密码") }, visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false), singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(value = state.captchaText, onValueChange = { state.captchaText = it }, label = { Text("验证码") }, singleLine = true, modifier = Modifier.weight(1f))
            val bitmap = remember(state.captcha) { runCatching { val bytes = Base64.decode(state.captcha?.text("image_base64") ?: "", Base64.DEFAULT); BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap() }.getOrNull() }
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(0.65f).clickable(enabled = !state.busy) { state.refreshCaptcha() }) {
                if (bitmap != null) Image(bitmap, "验证码，点击刷新", Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(8.dp)).background(Color.White)) else TextButton(onClick = { state.refreshCaptcha() }, enabled = !state.busy) { Text("加载验证码") }
                Text("点击刷新", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(checked = state.remember, onCheckedChange = { state.updateRemember(it) }); Text("记住学号和密码", style = MaterialTheme.typography.bodyMedium) }
        Button(onClick = { state.login() }, enabled = !state.busy && state.captcha != null && state.account.isNotBlank() && state.password.isNotEmpty() && state.captchaText.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("登录学校系统") }
        OutlinedButton(onClick = { state.startDemo() }, enabled = !state.busy, modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("演示模式") }
        Text("学校登录可能使其他设备的教务会话下线。会话仅存于内存；勾选后，学号和密码将在本机加密保存。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Picker("选择学期", state.semesters.map { it.text("code") to it.text("label") }, state.semester, { state.selectSemester(it) }, Modifier.weight(1.35f))
                Picker("选择周次", (1..state.totalWeeks).map { it.toString() to "第 $it 周" }, state.week.toString(), { state.week = it.toInt() }, Modifier.weight(1f))
                TextButton(onClick = { weeksInput = state.totalWeeks.toString(); weeksDialog = true }, contentPadding = PaddingValues(4.dp)) { Text("${state.totalWeeks}周", style = MaterialTheme.typography.labelMedium) }
        }
        val active = state.courses.filter { (it["weeks"] as? JsonArray)?.any { w -> (w as? JsonPrimitive)?.intOrNull == state.week } == true }
        if (active.isEmpty()) Text(if (state.busy) "正在加载课表…" else "本周暂无课程", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        val dark = isSystemInDarkTheme()
        val colors = if (dark) listOf(Color(0xFF244F47), Color(0xFF394563), Color(0xFF58452E), Color(0xFF503D55)) else listOf(Color(0xFFDCEFE7), Color(0xFFE4E9F9), Color(0xFFF8EBD4), Color(0xFFF1E3EF))
        val nodeTimes = listOf("08:00", "08:55", "10:10", "11:05", "14:30", "15:25", "16:30", "19:00", "19:55")
        val nodes = maxOf(nodeTimes.size, active.maxOfOrNull { it.number("end_node") } ?: nodeTimes.size)
        val today = java.time.LocalDate.now(ZoneId.of("Asia/Shanghai")).dayOfWeek.value
        Row(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Column(Modifier.width(30.dp)) {
                Spacer(Modifier.height(40.dp))
                (1..nodes).forEach { node -> Column(Modifier.height(64.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("$node", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val time = state.courses.firstOrNull { it.number("start_node") == node }?.text("start_time")
                    Text(time ?: nodeTimes.getOrNull(node - 1) ?: "—", fontSize = 7.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } }
            }
            (1..7).forEach { day -> Column(Modifier.weight(1f)) {
                Box(Modifier.fillMaxWidth().height(36.dp).clip(RoundedCornerShape(10.dp)).background(if (day == today) MaterialTheme.colorScheme.primaryContainer else Color.Transparent), contentAlignment = Alignment.Center) {
                    Text("周${"一二三四五六日"[day - 1]}", fontSize = 11.sp, fontWeight = if (day == today) FontWeight.Bold else FontWeight.Normal, color = if (day == today) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Spacer(Modifier.height(4.dp))
                Box(Modifier.fillMaxWidth().height((nodes * 64).dp)) {
                    active.filter { it.number("weekday") == day }.forEach { course ->
                        Surface(onClick = { onCourse(course) }, color = colors[state.courses.indexOf(course).coerceAtLeast(0) % colors.size], shape = RoundedCornerShape(8.dp), modifier = Modifier.offset(y = ((course.number("start_node") - 1) * 64).dp).fillMaxWidth().height(((course.number("end_node") - course.number("start_node") + 1) * 64 - 4).dp)) {
                            Column(Modifier.padding(horizontal = 3.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(course.text("name"), fontWeight = FontWeight.Bold, fontSize = 11.sp, lineHeight = 15.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                                Text(course.text("location"), fontSize = 9.sp, lineHeight = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                }
            } }
        }
    }
    if (weeksDialog) AlertDialog(onDismissRequest = { weeksDialog = false }, title = { Text("学期周数") }, text = { OutlinedTextField(weeksInput, { weeksInput = it }, label = { Text("1–30 周") }, isError = weeksInput.toIntOrNull() !in 1..30) }, confirmButton = { TextButton(onClick = { state.setWeeks(weeksInput.toInt()); weeksDialog = false }, enabled = weeksInput.toIntOrNull() in 1..30) { Text("确定") } }, dismissButton = { TextButton(onClick = { weeksDialog = false }) { Text("取消") } })
}

@Composable
fun Grades(state: SchoolState, onGrade: (JsonObject) -> Unit) {
    val summary = state.grades?.get("summary")?.obj()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("学业概览", style = MaterialTheme.typography.titleMedium)
                Text(summary?.text("weighted_gpa") ?: "—", style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.Bold)
                Text("加权平均绩点", style = MaterialTheme.typography.labelLarge)
                HorizontalDivider()
                listOf("required_gpa" to "必修绩点", "average_score" to "平均分", "required_average_score" to "必修平均分", "total_credits" to "总学分", "total_courses" to "课程数", "failed_count" to "不及格").chunked(2).forEach { row -> Row(Modifier.fillMaxWidth()) { row.forEach { (key, label) -> Text("$label  ${summary?.text(key) ?: "—"}", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium) } } }
            }
        }
        Text("课程成绩", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        val grades = state.grades?.items("grades") ?: emptyList()
        if (grades.isEmpty()) Text(if (state.busy) "正在加载成绩…" else "暂无成绩，点击右上角刷新重试。")
        grades.groupBy { it.text("semester") }.forEach { (semester, items) ->
            Text(semester.ifEmpty { "未指定学期" }, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelLarge)
            items.forEach { grade -> Card(onClick = { onGrade(grade) }, colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow), modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(grade.text("name"), fontWeight = FontWeight.SemiBold); Text("${grade.text("credits")} 学分 · 绩点 ${grade.text("grade_point")}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Text(grade.text("raw_score"), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                    Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } }
        }
        Text("成绩与排名仅存于内存，不存储、不上报。", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
