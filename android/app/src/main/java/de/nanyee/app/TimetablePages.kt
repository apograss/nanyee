package de.nanyee.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.*
import java.time.LocalDate

@Composable
internal fun TimetablePages(
    pager: PagerState,
    courses: List<JsonObject>,
    semesterStart: String,
    today: LocalDate,
    busy: Boolean,
    periodHeight: Dp,
    periodWidth: Dp,
    onCourse: (JsonObject) -> Unit,
    onConflicts: (List<JsonObject>) -> Unit
) {
    val verticalScroll = rememberScrollState()
    val nodeTimes = remember(courses) { periodStartTimes(courses) }
    val endTimes = remember(courses) { periodEndTimes(courses) }
    val nodes = maxOf(nodeTimes.size, courses.maxOfOrNull { it.number("end_node") } ?: 0)
    HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
        val week = page + 1
        val active = courses.filter { (it["weeks"] as? JsonArray)?.any { value -> (value as? JsonPrimitive)?.intOrNull == week } == true }
        val monday = teachingWeekMonday(semesterStart, week)
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                Spacer(Modifier.width(periodWidth))
                (1..7).forEach { day ->
                    val date = monday?.plusDays(day.toLong() - 1)
                    val isToday = date == today
                    Column(Modifier.weight(1f).padding(vertical = 4.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("周${"一二三四五六日"[day - 1]}", fontSize = 10.sp, lineHeight = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Surface(shape = RoundedCornerShape(12.dp), color = if (isToday) Color.White.copy(alpha = 0.65f) else Color.Transparent, contentColor = if (isToday) AppPrimary else AppMuted) {
                            Text(date?.let { "${it.monthValue}/${it.dayOfMonth}" } ?: "—", Modifier.padding(horizontal = 2.dp, vertical = 2.dp), fontSize = 11.sp, lineHeight = 14.sp, fontWeight = if (isToday) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                }
            }
            Spacer(Modifier.height(4.dp))
            Box(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxSize().verticalScroll(verticalScroll).padding(horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    Column(Modifier.width(periodWidth)) {
                        (1..nodes).forEach { node ->
                            Column(Modifier.height(periodHeight).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                                Text("$node", fontSize = 14.sp, lineHeight = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(nodeTimes.getOrNull(node - 1) ?: "—", style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum", letterSpacing = 0.sp), fontSize = 10.sp, lineHeight = 13.sp, maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(endTimes.getOrNull(node - 1) ?: "—", style = MaterialTheme.typography.labelSmall.copy(fontFeatureSettings = "tnum", letterSpacing = 0.sp), fontSize = 10.sp, lineHeight = 13.sp, maxLines = 1, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                    (1..7).forEach { day ->
                        Box(Modifier.weight(1f).height(periodHeight * nodes)) {
                            CourseDay(active.filter { it.number("weekday") == day }, nodes, periodHeight, onCourse, onConflicts, Modifier.fillMaxWidth())
                        }
                    }
                }
                if (active.isEmpty()) Text(
                    if (busy) "正在加载课表…" else if (monday == null) "暂无课表" else "本周暂无课程",
                    Modifier.padding(start = periodWidth + 8.dp, top = 8.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = AppMuted
                )
            }
        }
    }
}
