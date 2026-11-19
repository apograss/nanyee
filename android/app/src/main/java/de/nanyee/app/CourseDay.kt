package de.nanyee.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.Hyphens
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.JsonObject

@Composable
fun CourseDay(courses: List<JsonObject>, allCourses: List<JsonObject>, colors: List<Color>, nodes: Int, periodHeight: Dp, onCourse: (JsonObject) -> Unit, onConflicts: (List<JsonObject>) -> Unit, modifier: Modifier = Modifier) {
    val titleStyle = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp, lineHeight = 14.sp, fontWeight = FontWeight.Bold, lineBreak = LineBreak.Heading, hyphens = Hyphens.None)
    BoxWithConstraints(modifier.height(periodHeight * nodes)) {
        courseGroups(courses).forEach { group ->
            val placements = layoutCourses(group)
            val collapse = maxWidth / placements.first().laneCount < 44.dp
            val visible = if (collapse) placements.take(1) else placements
            visible.forEach { placement ->
                val course = placement.course
                val laneWidth = if (collapse) maxWidth else maxWidth / placement.laneCount
                val span = if (collapse) requireNotNull(courseSpan(group)) else course.number("start_node")..course.number("end_node")
                val name = course.text("name")
                val maxTitleLines = if (span.first == span.last) 1 else 3
                Surface(onClick = { if (collapse && group.size > 1) onConflicts(group) else onCourse(course) }, color = colors[allCourses.indexOf(course).coerceAtLeast(0) % colors.size], shape = RoundedCornerShape(8.dp), modifier = Modifier.offset(x = if (collapse) 0.dp else laneWidth * placement.lane, y = periodHeight * (span.first - 1)).width(laneWidth).padding(end = if (!collapse && placement.laneCount > 1) 2.dp else 0.dp).height(periodHeight * (span.last - span.first + 1) - 4.dp)) {
                    Column(Modifier.padding(horizontal = 3.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(course.text("start_time"), Modifier.weight(1f), fontSize = 8.sp, lineHeight = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (collapse && group.size > 1) Text("+${group.size - 1}", fontSize = 10.sp, lineHeight = 10.sp, maxLines = 1, fontWeight = FontWeight.Bold)
                        }
                        CourseTitle(name, titleStyle, maxTitleLines, Modifier.weight(1f, fill = false).fillMaxWidth())
                        Text(compactRoom(course.text("location")), fontSize = 8.sp, lineHeight = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

@Composable
private fun CourseTitle(name: String, style: TextStyle, maxLines: Int, modifier: Modifier = Modifier) {
    val density = LocalDensity.current
    BoxWithConstraints(modifier) {
        val explicit = remember(name, maxLines) { explicitCjkTitle(name, maxLines) }
        val floor = minOf(style.fontSize.value, 11.5f / density.fontScale)
        var fit by remember(name, maxWidth, maxHeight, style, density.fontScale, maxLines) { mutableStateOf(CourseTitleFit(style.fontSize.value)) }
        val fitting = explicit != name && !fit.fallback
        Text(
            if (fitting) explicit else name,
            Modifier.fillMaxWidth(),
            softWrap = !fitting,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
            style = style.copy(fontSize = fit.fontSize.sp),
            onTextLayout = { layout ->
                if (fitting) {
                    val overflow = layout.hasVisualOverflow || layout.lineCount > explicit.lines().size || (0 until layout.lineCount).any { layout.isLineEllipsized(it) }
                    val next = nextCourseTitleFit(fit, floor, overflow)
                    if (next != fit) fit = next
                }
            }
        )
    }
}
