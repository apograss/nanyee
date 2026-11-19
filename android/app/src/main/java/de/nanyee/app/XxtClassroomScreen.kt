package de.nanyee.app

import android.media.AudioManager
import android.media.ToneGenerator
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.findViewTreeLifecycleOwner
import kotlinx.coroutines.delay

@Composable
internal fun XxtClassroomContent(state: XxtState) {
    val activity = state.activity ?: return
    val page = state.classroomPage
    val draft = state.classroomDraft
    val enabled = !state.busy && !state.completed && activity.ongoing && page?.writable == true && !page.submitted
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (activity.description.isNotBlank()) Text(activity.description)
        if (page == null) Text(if (state.busy) "读取活动详情…" else "详情暂不可读取；当前仅可只读查看活动摘要。")
        else {
            if (page.title != activity.name) Text(page.title, style = MaterialTheme.typography.titleMedium)
            if (page.text.isNotBlank()) Text(page.text)
            if (page.notice.isNotBlank()) Text(page.notice)
            if (!activity.ongoing) Text("活动已结束，仅供只读查看。")
            page.questions.forEachIndexed { index, question ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${index + 1}. ${question.text}${if (question.required) "（必答）" else "（选答）"}")
                        if (!question.supported) Text("此题型或媒体暂不支持，请使用官方学习通。")
                        if (question.options.isNotEmpty()) {
                            val selected = draft.answers[question.id].orEmpty()
                            question.options.forEach { option ->
                                val checked = option.key in selected
                                val multi = question.type == 1
                                val choose = {
                                    val next = if (!multi) listOf(option.key) else if (checked) selected - option.key else selected + option.key
                                    state.updateClassroom(draft.copy(answers = draft.answers + (question.id to next)))
                                }
                                val selection = if (multi) Modifier.toggleable(checked, enabled = enabled, role = Role.Checkbox, onValueChange = { choose() }) else Modifier.selectable(checked, enabled = enabled, role = Role.RadioButton, onClick = choose)
                                Row(Modifier.fillMaxWidth().then(selection), verticalAlignment = Alignment.CenterVertically) {
                                    if (multi) Checkbox(checked, null, enabled = enabled) else RadioButton(checked, null, enabled = enabled)
                                    Text("${option.key}. ${option.text}", Modifier.weight(1f))
                                }
                            }
                        } else if (question.supported) {
                            repeat(if (question.type == 2) question.blanks else 1) { blank ->
                                OutlinedTextField(draft.answers[question.id]?.getOrNull(blank).orEmpty(), { text ->
                                    val values = MutableList(if (question.type == 2) question.blanks else 1) { draft.answers[question.id]?.getOrNull(it).orEmpty() }
                                    values[blank] = text.take(5000)
                                    state.updateClassroom(draft.copy(answers = draft.answers + (question.id to values)))
                                }, label = { Text(if (question.type == 2) "第 ${blank + 1} 空" else "手动填写答案") }, enabled = enabled, modifier = Modifier.fillMaxWidth())
                            }
                        }
                    }
                }
            }
            if (activity.type == 5) {
                Text("讨论回复", style = MaterialTheme.typography.titleMedium)
                if (page.replies.isEmpty()) Text("暂无回复。")
                page.replies.forEach { reply ->
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("${reply.author} · ${reply.time}", style = MaterialTheme.typography.labelLarge); Text(reply.text) } }
                }
                OutlinedTextField(draft.text, { state.updateClassroom(draft.copy(text = it.take(5000))) }, label = { Text("本人回复（部分讨论要求至少 10 字）") }, enabled = enabled, modifier = Modifier.fillMaxWidth())
            }
            if (activity.type == 23 && page.writable) {
                if (page.norms.isEmpty()) OutlinedTextField(draft.total, { state.updateClassroom(draft.copy(total = it.filter(Char::isDigit).take(3))) }, label = { Text("总分（0–100）") }, enabled = enabled, modifier = Modifier.fillMaxWidth())
                page.norms.forEachIndexed { index, norm ->
                    OutlinedTextField(draft.scores.getOrNull(index).orEmpty(), { text ->
                        val scores = MutableList(page.norms.size) { draft.scores.getOrNull(it).orEmpty() }; scores[index] = text.filter(Char::isDigit).take(7)
                        state.updateClassroom(draft.copy(scores = scores))
                    }, label = { Text("${norm.text}（0–${norm.maximum}）") }, enabled = enabled, modifier = Modifier.fillMaxWidth())
                }
                OutlinedTextField(draft.text, { state.updateClassroom(draft.copy(text = it.take(5000))) }, label = { Text("评价内容（可选）") }, enabled = enabled, modifier = Modifier.fillMaxWidth())
            }
            if (activity.type in xxtClassroomWrites && page.writable && !page.submitted) {
                Button(onClick = state::previewClassroom, enabled = enabled) { Text("预览并确认${if (activity.type == 5) "回复" else "提交"}") }
                Text("仅为当前本人账号提交。结果未知时不会自动重试；请在官方学习通核验。")
            }
        }
        if (activity.type == 11) XxtPickMonitor(state)
    }
}

@Composable
private fun XxtPickMonitor(state: XxtState) {
    val owner = LocalView.current.findViewTreeLifecycleOwner()
    val busy = state.busy
    DisposableEffect(owner, state.activity?.id, busy) {
        fun sync() { state.monitorPick(!busy && xxtPickVisible(state.activity, owner?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true)) }
        val observer = LifecycleEventObserver { _, _ -> sync() }
        owner?.lifecycle?.addObserver(observer); sync()
        onDispose { owner?.lifecycle?.removeObserver(observer); state.monitorPick(false) }
    }
    Text(state.pickMessage, style = MaterialTheme.typography.titleMedium)
    Text(if (state.pickMonitoring) "每 3 秒只读轮询；离开页面或切到后台即停止。" else "监测已暂停或停止。无后台服务。")
    if (state.pickAlert) {
        LaunchedEffect(Unit) {
            val tone = runCatching { ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70) }.getOrNull()
            try { runCatching { tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 300) }; delay(350) } finally { tone?.release() }
        }
        AlertDialog(onDismissRequest = state::dismissPickAlert, title = { Text("你被选中了！") }, text = { Text("${state.activity?.name}\n仅提示当前登录的本人账号。") }, confirmButton = { TextButton(onClick = state::dismissPickAlert) { Text("知道了") } })
    }
}

@Composable
internal fun XxtClassroomConfirmation(state: XxtState) {
    val value = state.classroomConfirmation ?: return
    AlertDialog(onDismissRequest = state::dismissClassroomConfirmation, title = { Text("确认本人${if (value.activity.type == 5) "回复" else "提交"}") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("账号：${value.user.name}（仅当前本人）\n课程：${value.course.name}\n活动：${value.activity.name}")
            value.page.questions.forEachIndexed { index, question ->
                val answers = value.draft.answers[question.id].orEmpty()
                Text("${index + 1}. ${question.text}")
                Text(if (answers.isEmpty()) "未作答（选答题）" else answers.joinToString("\n") { answer -> question.options.firstOrNull { it.key == answer }?.let { "${it.key}. ${it.text}" } ?: answer })
            }
            value.page.norms.forEachIndexed { index, norm -> Text("${norm.text}：${value.draft.scores[index]} / ${norm.maximum}") }
            if (value.activity.type == 23) Text("总分：${if (value.page.norms.isEmpty()) value.draft.total else value.draft.scores.sumOf { it.toInt() }.toString()}")
            if (value.draft.text.isNotBlank()) Text("${if (value.activity.type == 5) "实名回复" else "评价内容"}：${value.draft.text}")
            if (state.error.isNotBlank()) Text(state.error, color = MaterialTheme.colorScheme.error)
            Text(if (state.demo) "离线演示，不会发送网络请求。" else "将提交以上手动填写的内容并改变当前账号的活动状态。不会自动发送群聊回执。")
        }
    }, confirmButton = { Button(onClick = state::submitClassroom, enabled = !state.busy) { Text("确认提交") } }, dismissButton = { TextButton(onClick = state::dismissClassroomConfirmation, enabled = !state.busy) { Text("返回修改") } })
}
