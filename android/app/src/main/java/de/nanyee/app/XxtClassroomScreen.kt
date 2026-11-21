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
        if (page == null) Text(if (state.busy) "读取活动详情…" else "活动详情不可用")
        else {
            if (page.title != activity.name) Text(page.title, style = MaterialTheme.typography.titleMedium)
            if (page.text.isNotBlank()) Text(page.text)
            if (page.notice.isNotBlank()) Text(page.notice)
            if (!activity.ongoing) Text("活动已结束")
            page.questions.forEachIndexed { index, question ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${index + 1}. ${question.text}${if (question.required) "（必答）" else "（选答）"}")
                        if (!question.supported) Text("暂不支持此题型")
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
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text("${reply.author} · ${reply.time}", style = MaterialTheme.typography.labelLarge); Text(reply.text) } }
                }
                OutlinedTextField(draft.text, { state.updateClassroom(draft.copy(text = it.take(5000))) }, label = { Text("回复") }, enabled = enabled, modifier = Modifier.fillMaxWidth())
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
    if (state.pickAlert) {
        LaunchedEffect(Unit) {
            val tone = runCatching { ToneGenerator(AudioManager.STREAM_NOTIFICATION, 70) }.getOrNull()
            try { runCatching { tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 300) }; delay(350) } finally { tone?.release() }
        }
        AlertDialog(onDismissRequest = state::dismissPickAlert, title = { Text("你被选中了！") }, text = { Text("${state.activity?.name}") }, confirmButton = { TextButton(onClick = state::dismissPickAlert) { Text("知道了") } })
    }
}

@Composable
internal fun XxtClassroomConfirmation(state: XxtState) {
    val value = state.classroomConfirmation ?: return
    AlertDialog(onDismissRequest = state::dismissClassroomConfirmation, title = { Text("确认本人${if (value.activity.type == 5) "回复" else "提交"}") }, text = {
        Text(if (state.demo) "确认演示提交？" else "确认提交当前填写的内容？")
    }, confirmButton = { Button(onClick = state::submitClassroom, enabled = !state.busy) { Text("确认提交") } }, dismissButton = { TextButton(onClick = state::dismissClassroomConfirmation, enabled = !state.busy) { Text("返回修改") } })
}
