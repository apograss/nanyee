package de.nanyee.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
@OptIn(ExperimentalLayoutApi::class)
internal fun CourseGrabScreen(school: SchoolState, live: CourseGrabState, demoState: CourseGrabState, onBack: () -> Unit) {
    var demoChoice by rememberSaveable { mutableStateOf(false) }
    val demo = school.demo || demoChoice
    val state = if (demo) demoState else live
    BackHandler { if (!state.locked) onBack() }
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack, enabled = !state.locked) { Text("返回工具") }
        Text("抢课 · 本机", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("运行或等待开始时请保持 App 在前台；页面会保持屏幕常亮。没有后台服务，系统结束进程会中断；中断后请先到教务系统核验，不要直接重复提交。", color = MaterialTheme.colorScheme.error)
        Text(if (demo) "演示模式：不联网，不会真实选课。" else "复用学校直连会话；只读加载不会提交。没有退课或已选查询功能。")
        if (!school.demo) TextButton(onClick = { demoChoice = !demoChoice }, enabled = !live.locked && !demoState.locked) { Text(if (demoChoice) "返回真实学校数据" else "无账号体验演示") }
        if (demo) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GrabDemoScenario.entries.forEach { scenario ->
                FilterChip(selected = state.scenario == scenario, onClick = { state.demoScenario(scenario) }, enabled = !state.locked, label = { Text(scenario.label) })
            }
        }
        if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        Button(onClick = { state.load({ if (demo) "demo-${state.scenario}" else school.evaluationSessionIdentity }) { if (demo) DemoCourseGrabSource(state.scenario) else school.courseGrabAccess() } }, enabled = !state.locked) { Text("只读加载选课类型") }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            state.categories.forEach { category -> FilterChip(selected = state.category == category, onClick = { state.choose(category) }, enabled = !state.locked, label = { Text(category.title) }) }
        }
        if (state.category != null) {
            OutlinedButton(onClick = { state.choose(state.category!!) }, enabled = !state.locked) { Text("刷新课程与容量（会清空志愿）") }
            Text("容量是列表快照，不保证提交时仍有名额。")
        }
        Text("志愿顺序（最多 4 个）", style = MaterialTheme.typography.titleLarge)
        state.preferences.forEachIndexed { index, course ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text("${index + 1}. ${course.name} · ${course.teacher}")
                    FlowRow {
                        TextButton(onClick = { state.move(index) }, enabled = !state.locked && index > 0) { Text("上移") }
                        TextButton(onClick = { state.remove(course) }, enabled = !state.locked) { Text("移除") }
                    }
                }
            }
        }
        OutlinedTextField(state.attempts, { state.attempts = it }, label = { Text("尝试次数（1–120，默认 15）") }, enabled = !state.locked, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(state.primary, { state.primary = it }, label = { Text("先尝试第一志愿次数（默认 5）") }, enabled = !state.locked, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row { Switch(state.conflicts, { state.conflicts = it }, enabled = !state.locked); Text("允许冲突确认（默认关闭，开启后可能与已有课程冲突）", Modifier.weight(1f).padding(start = 8.dp)) }
        OutlinedTextField(state.scheduled, { state.scheduled = it }, label = { Text("可选：开始时间 HH:mm:ss（北京时间）") }, enabled = !state.locked, singleLine = true, modifier = Modifier.fillMaxWidth())
        Text("开始前采样学校 Date 时钟 3 次，取最小 RTT。按校准时间提前约 50 ms；时间已过则顺延明天；校时精度约一秒。")
        Button(onClick = { state.review() }, enabled = !state.locked && state.preferences.isNotEmpty()) { Text("查看开始确认摘要") }
        if (state.run.status.isNotBlank()) {
            HorizontalDivider()
            Text(if (state.run.active) "运行中 · ${state.run.attempt} 次尝试" else "本轮结果", style = MaterialTheme.typography.titleLarge)
            Text(state.run.status)
            if (state.run.active) OutlinedButton(onClick = { state.cancel() }) { Text("立即取消") }
            if (state.run.outcome.isNotBlank()) Text(state.run.outcome, fontWeight = FontWeight.Bold)
            state.run.events.takeLast(12).forEach { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
        HorizontalDivider()
        OutlinedTextField(state.query, { state.query = it }, label = { Text("搜索课程名 / 教师") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Text("已加载 ${state.courses.size} 门")
        state.courses.filter { state.query.isBlank() || it.name.contains(state.query, true) || it.teacher.contains(state.query, true) }.forEach { course ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(course.name, style = MaterialTheme.typography.titleMedium)
                    Text(course.teacher)
                    if (course.time.isNotBlank()) Text(course.time)
                    if (course.place.isNotBlank()) Text(course.place)
                    Text("已选 / 容量：${course.selected} / ${course.capacity}")
                    TextButton(onClick = { state.select(course) }, enabled = !state.locked && state.preferences.size < 4 && state.preferences.none { it.code == course.code }) { Text("加入末位志愿") }
                }
            }
        }
    }
    state.confirmation?.let { plan ->
        AlertDialog(onDismissRequest = { state.dismiss() }, title = { Text(if (demo) "确认演示抢课" else "确认开始抢课？") }, text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(if (demo) "演示模式，不会真实选课。" else "将向学校提交选课请求，可能改变已选课程。请保持前台。")
                Text("类型：${plan.category.title}")
                plan.preferences.forEachIndexed { i, course -> Text("${i + 1}. ${course.name} · ${course.teacher}") }
                Text("最多 ${plan.attempts} 次；先尝试首志愿 ${plan.primary} 次，之后按顺序循环。")
                Text("冲突确认：${if (plan.conflicts) "允许" else "不允许"}\n开始：${plan.scheduled.ifBlank { "立即" }}")
                Text("未开放最多等候 600 轮。超时结果未知时不追加核验写入；请到教务系统人工确认。")
            }
        }, confirmButton = { TextButton(onClick = { state.start() }) { Text("确认开始") } }, dismissButton = { TextButton(onClick = { state.dismiss() }) { Text("返回检查") } })
    }
}
