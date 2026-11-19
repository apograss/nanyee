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
import androidx.lifecycle.viewmodel.compose.viewModel

@Composable
internal fun ToolsScreen(school: SchoolState) {
    var route by rememberSaveable { mutableStateOf("") }
    val back = { route = "" }
    when (route) {
        "cabin" -> CabinToolsScreen(school, onBack = back)
        "automatic" -> CabinToolsScreen(school, state = viewModel(key = "evaluation-platform"), evaluationMode = true, onBack = { route = "evaluation" })
        "manual" -> ManualEvaluationScreen(school, onBack = { route = "evaluation" })
        else -> {
            BackHandler(route.isNotEmpty()) { route = "" }
            Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                if (route.isNotEmpty()) TextButton(onClick = back) { Text("返回工具") }
                Text(if (route == "evaluation") "课程评价" else "校园工具", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                if (route == "evaluation") {
                    ToolCard("自动评课 · 服务器", "明确同意托管学校凭据后，由 Nanyee 每天无人值守运行。", { route = "automatic" })
                    ToolCard("手动一键 · 本机", "直连学校，只读加载、选择课程、预览答案；确认后逐门提交。不使用 Nanyee 服务器。", { route = "manual" })
                } else {
                    Text("按需开启，让日常更从容。")
                    ToolCard("学习舱预约", "选择舱位优先级，交给服务器按时尝试预约。", { route = "cabin" })
                    ToolCard("课程评价", "服务器自动评课，或本机预览确认后手动一键提交。", { route = "evaluation" })
                }
            }
        }
    }
}

@Composable
private fun ToolCard(title: String, description: String, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(description)
        }
    }
}

@Composable
private fun ManualEvaluationScreen(school: SchoolState, onBack: () -> Unit) {
    var demoChoice by rememberSaveable { mutableStateOf(false) }
    var confirming by remember { mutableStateOf(false) }
    val demo = school.demo || demoChoice
    val state: EvaluationState = viewModel(key = if (demo) "manual-evaluation-demo" else "manual-evaluation-live")
    BackHandler(!state.busy) { state.run.dismiss(); onBack() }
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = { state.run.dismiss(); onBack() }, enabled = !state.busy) { Text("返回课程评价") }
        Text("手动一键评课", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text(if (demo) "演示模式 · 不联网，不会提交真实评价。" else "学校直连 · 不托管密码，不使用 Nanyee 服务器。只读加载不会提交评价。")
        if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        Button(onClick = { state.load { if (demo) state.demoSource else school.evaluationAccess() } }, enabled = !state.busy) { Text("只读加载待评课程") }
        if (!school.demo) TextButton(onClick = { demoChoice = !demoChoice }, enabled = !state.busy) { Text(if (demoChoice) "返回真实学校数据" else "无账号体验演示") }
        if (state.listed && state.pending.isEmpty()) Text("暂无待评课程。可能评教尚未开放，或今天及昨天的课程已评完。")
        if (state.pending.isNotEmpty()) {
            Text("待评 ${state.pending.size} 门 · 已选 ${state.selected.size} 门")
            TextButton(onClick = { state.selected = if (state.selected.size == state.pending.size) emptySet() else state.pending.map { it.key }.toSet(); state.run.dismiss() }, enabled = !state.busy) { Text("全选 / 全不选") }
            state.pending.forEach { course ->
                Row(Modifier.fillMaxWidth()) {
                    Checkbox(course.key in state.selected, { checked -> state.selected = if (checked) state.selected + course.key else state.selected - course.key; state.run.dismiss() }, enabled = !state.busy)
                    Text("${course.courseName}\n${course.teacherName} · ${course.endDate}", Modifier.weight(1f))
                }
            }
            Button(onClick = { state.prepare() }, enabled = !state.busy && state.selected.isNotEmpty()) { Text("生成并预览答案（不提交）") }
        }
        state.run.preview.forEach { value ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(value.draft.reference.courseName, fontWeight = FontWeight.Bold)
                    value.draft.questions.forEach { question ->
                        val chosen = question.options.first { it.code == value.selections[question.indicator] }
                        Text("${question.title}\n${chosen.label} · ${chosen.score} 分")
                    }
                }
            }
        }
        if (state.run.preview.isNotEmpty()) {
            Text("使用旧工具偏高随机档位。此处显示的答案会原样提交，不会在确认时重新生成。")
            Button(onClick = { confirming = true }, enabled = !state.busy) { Text(if (demo) "确认演示提交" else "确认提交以上评价") }
        }
        if (state.run.progress > 0) Text("逐门进度：${state.run.progress}")
        state.run.results.forEach { Text(it) }
        if (state.run.confirmed) Text("本轮已执行或已停止。结果未知时请先到教务系统核验；不要直接重复提交。")
    }
    if (confirming) AlertDialog(onDismissRequest = { confirming = false }, title = { Text("确认提交课程评价？") }, text = { Text(if (demo) "演示模式，不会真正评课。" else "将逐门向学校提交上方预览的评价；第一处错误后立即停止。真实提交不可撤回，请确认您同意这些答案。") }, confirmButton = {
        TextButton(onClick = { confirming = false; state.confirm() }, enabled = !state.busy) { Text("确认提交") }
    }, dismissButton = { TextButton(onClick = { confirming = false }) { Text("返回检查") } })
}
