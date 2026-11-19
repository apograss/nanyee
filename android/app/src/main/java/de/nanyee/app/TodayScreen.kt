package de.nanyee.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ArrowForward
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.serialization.json.JsonObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
@OptIn(ExperimentalLayoutApi::class)
internal fun TodayScreen(state: SchoolState, onCourse: (JsonObject) -> Unit) {
    val agenda = remember(state.courses, state.semesterStart, state.totalWeeks, state.now) {
        todaySchedule(state.courses, state.semesterStart, state.totalWeeks, state.now)
    }
    val weekday = "周${"一二三四五六日"[state.now.dayOfWeek.value - 1]}"
    val date = state.now.format(DateTimeFormatter.ofPattern("M月d日"))
    Column(Modifier.widthIn(max = 720.dp).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(date, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            agenda.week?.let { Text("第 $it 周 ·", softWrap = false, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Text(weekday, softWrap = false, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (agenda.message.isNotEmpty()) {
            Card(Modifier.fillMaxWidth()) { Text(agenda.message, Modifier.padding(20.dp)) }
        } else {
            when {
                agenda.current.isNotEmpty() -> agenda.current.forEach { course ->
                    TodayCourseCard(course, "正在上课 · 还有 ${minutesUntil(state.now, requireNotNull(course.end))} 分钟结束", true, onCourse)
                }
                agenda.next != null -> TodayCourseCard(agenda.next, "下一节 · 还有 ${minutesUntil(state.now, requireNotNull(agenda.next.start))} 分钟", true, onCourse)
                agenda.classes.isEmpty() -> {
                    Text("今天没课", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("把时间留给自己。", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                agenda.classes.all { it.phase == ClassPhase.PAST } -> Text("今天的课程已结束", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            }
            val rest = agenda.classes.filter { it !in agenda.current && (agenda.current.isNotEmpty() || it != agenda.next) }
            if (rest.isNotEmpty()) Text("今日课程", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            rest.forEach { TodayCourseCard(it, when (it.phase) { ClassPhase.PAST -> "已结束"; ClassPhase.UNKNOWN -> "时间待确认"; else -> "待上课" }, false, onCourse) }
            agenda.nextDay?.let { nextDay ->
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf("下次有课 ·", nextDay.format(DateTimeFormatter.ofPattern("M月d日")), "周${"一二三四五六日"[nextDay.dayOfWeek.value - 1]}").forEach { token ->
                        Text(token, softWrap = false, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }
                }
                agenda.preview.forEach { TodayCourseCard(it, "课程预览", false, onCourse) }
            }
            if (agenda.classes.isEmpty() && agenda.preview.isEmpty()) Text("本学期暂无后续课程安排。", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        TextButton(onClick = { state.selectTab(1) }) { Text("查看完整课表"); Spacer(Modifier.width(8.dp)); Icon(Icons.Outlined.ArrowForward, null) }
        val updated = remember(state.timetableUpdatedAt) {
            runCatching { DateTimeFormatter.ofPattern("M月d日 HH:mm").withZone(ZoneId.of("Asia/Shanghai")).format(Instant.parse(state.timetableUpdatedAt)) }.getOrDefault("")
        }
        Text(if (state.demo) "演示课表 · 示例校历" else if (updated.isNotEmpty()) "更新于 $updated · ${if (state.cachedMode) "本机缓存" else "学校课表"}" else "课表尚未更新", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("时间按北京时间显示", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun TodayCourseCard(course: TodayClass, caption: String, highlighted: Boolean, onCourse: (JsonObject) -> Unit) {
    Card(onClick = { onCourse(course.course) }, modifier = Modifier.fillMaxWidth().alpha(if (course.phase == ClassPhase.PAST) 0.6f else 1f), colors = CardDefaults.cardColors(containerColor = if (highlighted) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerLow)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(caption, style = MaterialTheme.typography.labelLarge, color = if (highlighted) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant)
            Text(course.course.text("name"), style = if (highlighted) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text("${course.course.text("start_time").ifBlank { "时间待定" }}–${course.course.text("end_time").ifBlank { "待定" }} · ${course.course.text("location").ifBlank { "地点待定" }}", style = MaterialTheme.typography.bodyMedium)
            course.course.text("teachers").takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
    }
}
