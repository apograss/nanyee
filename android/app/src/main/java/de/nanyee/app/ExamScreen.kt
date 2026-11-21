package de.nanyee.app

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonObject

@Composable
internal fun ExamNumber(row: JsonObject) {
    val number = row.text("exam_number")
    val clipboard = LocalClipboardManager.current
    if (number.isNotBlank()) Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("网考号", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(number, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodyLarge)
        }
        TextButton(onClick = { clipboard.setText(AnnotatedString(number)) }) { Text("复制") }
    }
}

internal fun examTime(row: JsonObject) = listOf(row.text("start_time"), row.text("end_time")).filter { it.isNotBlank() }.joinToString("–")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ExamDetailSheet(row: JsonObject, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(row.text("name"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(listOf(row.text("date"), examTime(row)).filter { it.isNotBlank() }.joinToString(" · "))
            Text(row.text("location").ifBlank { "地点待定" })
            if (row.text("seat").isNotBlank()) Text("座位 ${row.text("seat")}")
            ExamNumber(row)
        }
    }
}

@Composable
internal fun ExamsScreen(school: SchoolState, onBack: () -> Unit) {
    BackHandler(onBack = onBack)
    var pastExpanded by remember(school.semester) { mutableStateOf(false) }
    var selected by remember(school.courseDataIdentity) { mutableStateOf<JsonObject?>(null) }
    val exams = school.exams
    val today = school.today.toString()
    val upcoming = exams.filter { it.text("date") >= today }
    val past = exams.filter { it.text("date") < today }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = onBack) { Text("返回工具") }
        Text("待考", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (!school.homeVisible) Login(school, embedded = true) else {
            if (upcoming.isEmpty()) Text("暂无待考", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            @Composable fun rows(values: List<JsonObject>) {
                values.forEach { exam ->
                    Column(Modifier.fillMaxWidth().clickable { selected = exam }.padding(vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(exam.text("name"), style = MaterialTheme.typography.titleMedium)
                        Text("${exam.text("date")} · ${examTime(exam)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (exam.text("location").isNotBlank()) Text(exam.text("location"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        ExamNumber(exam)
                    }
                    HorizontalDivider()
                }
            }
            rows(upcoming)
            TextButton(onClick = { pastExpanded = !pastExpanded }) { Text("已结束 (${past.size}) ${if (pastExpanded) "收起" else "展开"}") }
            if (pastExpanded) rows(past.asReversed())
        }
    }
    selected?.let { ExamDetailSheet(it) { selected = null } }
}

@Composable
internal fun ExamReminder(exams: List<JsonObject>, onExam: (JsonObject) -> Unit) {
    val exam = exams.firstOrNull() ?: return
    TextButton(onClick = { onExam(exam) }, modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp), contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)) {
        Text("${exam.text("start_time")} ${exam.text("name")} 考试${if (exams.size > 1) " · 共${exams.size}场" else ""}", Modifier.fillMaxWidth(), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
    }
}
