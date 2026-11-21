package de.nanyee.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FactCheck
import androidx.compose.material.icons.outlined.Assessment
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.CloudQueue
import androidx.compose.material.icons.outlined.EventSeat
import androidx.compose.material.icons.outlined.RateReview
import androidx.compose.material.icons.outlined.Widgets
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.serialization.json.JsonObject

@Composable
internal fun ToolsScreen(school: SchoolState, grab: CourseGrabState, grabDemo: CourseGrabState, onGrade: (JsonObject) -> Unit) {
    val back = { if (school.canReturnToCache) school.returnToCache(); school.closeTool(); school.selectTab(MainTab.TOOLS) }
    when (school.toolsRoute) {
        "cabin" -> CabinToolsScreen(school, onBack = back)
        "grab" -> CourseGrabScreen(school, grab, grabDemo, onBack = back)
        "grades" -> {
            BackHandler(onBack = back)
            Column(Modifier.fillMaxSize()) {
                TextButton(onClick = back) { Text("返回工具") }
                if (!school.homeVisible) Login(school)
                else if (school.cachedMode) {
                    Button(onClick = school::openGrades, enabled = !school.busy) { Text("登录学校系统查看成绩") }
                } else Grades(school, onGrade)
            }
        }
        else -> Column(Modifier.widthIn(max = 960.dp).fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val gpa = school.grades?.get("summary")?.obj()?.text("weighted_gpa").orEmpty()
            ToolGrid(listOf(
                ToolTile("成绩", Icons.Outlined.Assessment, SectionAccent.ACADEMIC, if (gpa.isNotBlank()) "GPA ${displayNumber(gpa)}" else "", school::openGrades),
                ToolTile("自习舱预约", Icons.Outlined.EventSeat, SectionAccent.SAGE, onClick = { school.openTool("cabin") }),
                ToolTile("抢课", Icons.Outlined.Bolt, SectionAccent.SERVICE, if (grab.run.active || grabDemo.run.active) "运行中" else "", { school.openTool("grab") })
            ))
        }
    }
}

@Composable
internal fun EvaluationToolsScreen(school: SchoolState, evaluation: EvaluationState) {
    var route by rememberSaveable { mutableStateOf("") }
    val summaryState: EvaluationState = if (school.demo) viewModel(key = "manual-evaluation-demo") else evaluation
    val back = { route = "" }
    when (route) {
        "automatic" -> CabinToolsScreen(school, state = viewModel(key = "evaluation-platform"), evaluationMode = true, onBack = back)
        "manual" -> ManualEvaluationScreen(school, evaluation, onBack = back)
        else -> {
            Column(Modifier.widthIn(max = 720.dp).fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                ProfileHero(if (summaryState.listed) "${summaryState.pending.size} 门待评" else "待评课程", if (summaryState.listed) "已选 ${summaryState.selected.size} 门" else "", Icons.AutoMirrored.Outlined.FactCheck)
                CompactEntry("自动评课", icon = Icons.Outlined.CloudQueue, accent = SectionAccent.BRAND, onClick = { route = "automatic" })
                CompactEntry("手动评课", icon = Icons.AutoMirrored.Outlined.FactCheck, accent = SectionAccent.ACADEMIC, onClick = { route = "manual" })
            }
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun ManualEvaluationScreen(school: SchoolState, evaluation: EvaluationState, onBack: () -> Unit) {
    var demoChoice by rememberSaveable { mutableStateOf(false) }
    var confirming by remember { mutableStateOf(false) }
    val demo = school.demo || demoChoice
    val demoState: EvaluationState = viewModel(key = "manual-evaluation-demo")
    val state = if (demo) demoState else evaluation
    BackHandler(!state.busy) { state.run.dismiss(); onBack() }
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TextButton(onClick = { state.run.dismiss(); onBack() }, enabled = !state.busy) { Text("返回课程评价") }
        Text("手动一键评课", style = MaterialTheme.typography.headlineMedium)
        if (state.error.isNotBlank()) InlineError(state.error)
        if (state.busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (demo) ScenarioPicker(state.demoScenario.label, DemoEvaluationScenario.entries.map { it.label }, enabled = !state.busy) { state.selectDemoScenario(DemoEvaluationScenario.entries[it]) }
        if (state.run.stale) Text("学校会话已变更", color = MaterialTheme.colorScheme.error)
        Button(onClick = { state.load({ if (demo) "demo" else school.evaluationSessionIdentity }) { if (demo) state.demoSource else school.evaluationAccess() } }, enabled = !state.busy) { Text("只读加载待评课程") }
        if (!school.demo) TextButton(onClick = { demoChoice = !demoChoice }, enabled = !state.busy) { Text(if (demoChoice) "返回真实学校数据" else "无账号体验演示") }
        if (state.listed && state.pending.isEmpty()) Text("暂无待评课程")
        if (state.pending.isNotEmpty() && state.run.preview.isEmpty()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) { SectionHeading("待评 ${state.pending.size} 门", "已选 ${state.selected.size} 门", Icons.Outlined.RateReview, SectionAccent.PLUM) }
            }
            TextButton(onClick = { state.selected = if (state.selected.size == state.pending.size) emptySet() else state.pending.map { it.key }.toSet(); state.run.dismiss() }, enabled = !state.busy) { Text("全选 / 全不选") }
            state.pending.forEach { course ->
                Row(Modifier.fillMaxWidth()) {
                    Checkbox(course.key in state.selected, { checked -> state.selected = if (checked) state.selected + course.key else state.selected - course.key; state.run.dismiss() }, enabled = !state.busy)
                    Text("${course.courseName}\n${course.teacherName} · ${course.endDate}", Modifier.weight(1f))
                }
            }
            Button(onClick = { state.prepare() }, enabled = !state.busy && state.selected.isNotEmpty()) { Text("预览评价") }
        }
        if (state.run.preview.isNotEmpty()) TextButton(onClick = { state.run.dismiss() }, enabled = !state.busy) { Text("返回待评课程") }
        state.run.preview.forEach { value ->
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    CourseHeading(value.draft.reference.courseName, value.draft.reference.teacherName, showAvatar = false)
                    Text("合计 ${evaluationTotal(value)} 分", style = MaterialTheme.typography.titleLarge)
                    OutlinedButton(onClick = { state.run.randomize(value.draft.reference.key) }, enabled = !state.busy && !confirming) { Text("重新随机") }
                    value.draft.questions.forEach { question ->
                        EvaluationAnswerEditor(question, value.selections.getValue(question.indicator), !state.busy && !confirming) { answer ->
                            state.run.setAnswer(value.draft.reference.key, question.indicator, answer)
                        }
                    }
                }
            }
        }
        if (state.run.preview.isNotEmpty()) {
            Button(onClick = { confirming = true }, enabled = !state.busy) { Text(if (demo) "确认演示提交" else "确认提交以上评价") }
        }
        if (state.run.progress > 0) Text(if (state.busy && state.run.confirmed) "正在提交第 ${state.run.progress} 门…" else "逐门进度：${state.run.progress}")
        state.run.results.forEach { Text(it) }
    }
    if (confirming) AlertDialog(onDismissRequest = { confirming = false }, title = { Text("确认提交课程评价？") }, text = { Text(if (demo) "演示模式，不会真正评课。" else "评价提交后不可撤回，确认提交？") }, confirmButton = {
        TextButton(onClick = { confirming = false; state.confirm() }, enabled = !state.busy) { Text("确认提交") }
    }, dismissButton = { TextButton(onClick = { confirming = false }) { Text("返回检查") } })
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun EvaluationAnswerEditor(question: EvaluationQuestion, value: String, enabled: Boolean, onChange: (String) -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(question.title, style = MaterialTheme.typography.titleSmall)
        when {
            question.isText -> OutlinedTextField(value = value, onValueChange = { text ->
                if (runCatching { validateEvaluationAnswer(question, text) }.isSuccess) onChange(text)
            }, label = { Text("意见与建议") }, supportingText = { Text("${value.length}/${question.textLimit}") }, enabled = enabled, modifier = Modifier.fillMaxWidth(), minLines = 2)
            question.type == 5 -> {
                val selectedIndex = question.options.indexOfFirst { it.code == value }
                FlowRow(Modifier.selectableGroup()) {
                    question.options.forEachIndexed { index, option ->
                        Box(Modifier.size(48.dp).selectable(selected = option.code == value, enabled = enabled, role = Role.RadioButton, onClick = { onChange(option.code) })
                            .semantics { contentDescription = "${index + 1} 星：${option.label}" }, contentAlignment = Alignment.Center) {
                            Icon(if (index <= selectedIndex) Icons.Filled.Star else Icons.Outlined.StarBorder, contentDescription = null, tint = if (index <= selectedIndex) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                Text(evaluationAnswerLabel(question, value), style = MaterialTheme.typography.bodyMedium)
            }
            else -> {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    question.options.forEach { option ->
                        FilterChip(selected = option.code == value, onClick = { onChange(option.code) }, enabled = enabled, label = { Text(option.label) })
                    }
                }
                Text(evaluationAnswerLabel(question, value), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
