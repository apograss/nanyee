package de.nanyee.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
internal fun CourseGrabScreen(school: SchoolState, live: CourseGrabState, demoState: CourseGrabState, onBack: () -> Unit) {
    var demoChoice by rememberSaveable { mutableStateOf(false) }
    var details by remember { mutableStateOf<GrabCourse?>(null) }
    var pane by rememberSaveable { mutableStateOf("courses") }
    val demo = school.demo || demoChoice
    val state = if (demo) demoState else live
    BackHandler { if (!state.locked) onBack() }
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack, enabled = !state.locked) { Text("返回工具") }
        SectionHeading("抢课", "", Icons.Outlined.Bolt, SectionAccent.SERVICE)
        if (!school.demo) TextButton(onClick = { demoChoice = !demoChoice }, enabled = !live.locked && !demoState.locked) { Text(if (demoChoice) "返回真实学校数据" else "无账号体验演示") }
        if (demo) ScenarioPicker(state.scenario.label, GrabDemoScenario.entries.map { it.label }, !state.locked) { state.demoScenario(GrabDemoScenario.entries[it]) }
        if (!state.locked) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(pane == "courses", { pane = "courses" }, label = { Text("课程") })
            FilterChip(pane == "settings", { pane = "settings" }, label = { Text("志愿 (${state.preferences.size})") })
        }
        if (state.error.isNotBlank()) InlineError(state.error)
        if (state.discoveryNotice.isNotBlank()) InlineError(state.discoveryNotice)
        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (!state.locked && pane == "courses") {
        Button(onClick = { state.load({ if (demo) "demo-${state.scenario}" else school.evaluationSessionIdentity }) { if (demo) DemoCourseGrabSource(state.scenario) else school.courseGrabAccess() } }, enabled = !state.locked) { Text("加载选课类型") }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            state.categories.forEach { category -> FilterChip(selected = state.category == category, onClick = { state.choose(category) }, enabled = !state.locked, label = { Text(category.title) }) }
        }
        if (state.category != null) {
            OutlinedButton(onClick = { state.choose(state.category!!) }, enabled = !state.locked) { Text("刷新课程") }
        }
        }
        if (!state.locked && pane == "settings") {
        Text("志愿顺序（最多 4 个）", style = MaterialTheme.typography.titleLarge)
        state.preferences.forEachIndexed { index, course ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("${index + 1}. ${course.name} · ${course.teacher}")
                    FlowRow {
                        TextButton(onClick = { state.move(index) }, enabled = !state.locked && index > 0) { Text("上移") }
                        TextButton(onClick = { state.remove(course) }, enabled = !state.locked) { Text("移除") }
                    }
                }
            }
        }
        OutlinedTextField(state.attempts, { state.attempts = it }, label = { Text("尝试次数") }, enabled = !state.locked, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(state.primary, { state.primary = it }, label = { Text("首志愿尝试次数") }, enabled = !state.locked, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row { Switch(state.conflicts, { state.conflicts = it }, enabled = !state.locked); Text("允许课程冲突", Modifier.weight(1f).padding(start = 8.dp)) }
        OutlinedTextField(state.scheduled, { state.scheduled = it }, label = { Text("开始时间 HH:mm:ss（可选）") }, enabled = !state.locked, singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(onClick = { state.review() }, enabled = !state.locked && state.preferences.isNotEmpty()) { Text("查看开始确认摘要") }
        }
        if (state.run.status.isNotBlank()) {
            HorizontalDivider()
            Text(if (state.run.active) "运行中 · ${state.run.attempt} 次尝试" else "本轮结果", style = MaterialTheme.typography.titleLarge)
            Text(state.run.status)
            if (state.run.active) OutlinedButton(onClick = { state.cancel() }) { Text("立即取消") }
            if (state.run.outcome.isNotBlank()) Text(state.run.outcome, fontWeight = FontWeight.Bold)
            state.run.events.takeLast(12).forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
        if (!state.locked && pane == "courses") {
        HorizontalDivider()
        OutlinedTextField(state.query, { state.query = it }, label = { Text("搜索课程名 / 教师") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Text("已加载 ${state.courses.size} 门")
        state.courses.filter { state.query.isBlank() || it.name.contains(state.query, true) || it.teacher.contains(state.query, true) }.forEach { course ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(course.name, style = MaterialTheme.typography.titleMedium)
                    Text("${course.teacher} · ${course.selected}/${course.capacity}", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = { details = course }) { Text("课程详情") }
                    TextButton(onClick = { state.select(course) }, enabled = !state.locked && state.preferences.size < 4 && state.preferences.none { it.code == course.code }) { Text("加入末位志愿") }
                }
            }
        }
    }
        }
    details?.let { course ->
        ModalBottomSheet(onDismissRequest = { details = null }) {
            Column(Modifier.fillMaxWidth().padding(16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                CourseHeading(course.name, course.teacher, showAvatar = false)
                Text("时间 · ${course.time.ifBlank { "暂无" }}")
                Text("地点 · ${course.place.ifBlank { "暂无" }}")
                Text("已选 / 容量 · ${course.selected}/${course.capacity}")
            }
        }
    }
    state.confirmation?.let { plan ->
        AlertDialog(onDismissRequest = { state.dismiss() }, title = { Text(if (demo) "确认演示抢课" else "确认开始抢课？") }, text = {
            Text(if (demo) "开始演示选课？" else "将提交选课请求，请保持前台。")
        }, confirmButton = { TextButton(onClick = { state.start() }) { Text("确认开始") } }, dismissButton = { TextButton(onClick = { state.dismiss() }) { Text("返回检查") } })
    }
}
