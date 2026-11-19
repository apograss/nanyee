package de.nanyee.app

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.serialization.json.JsonObject

@Composable
fun CourseDay(courses: List<JsonObject>, allCourses: List<JsonObject>, colors: List<Color>, nodes: Int, onCourse: (JsonObject) -> Unit, onConflicts: (List<JsonObject>) -> Unit, modifier: Modifier = Modifier) {
    BoxWithConstraints(modifier.height((nodes * 64).dp)) {
        courseGroups(courses).forEach { group ->
            val placements = layoutCourses(group)
            val collapse = maxWidth / placements.first().laneCount < 44.dp
            val visible = if (collapse) placements.take(1) else placements
            visible.forEach { placement ->
                val course = placement.course
                val laneWidth = if (collapse) maxWidth else maxWidth / placement.laneCount
                val span = if (collapse) requireNotNull(courseSpan(group)) else course.number("start_node")..course.number("end_node")
                Surface(onClick = { if (collapse && group.size > 1) onConflicts(group) else onCourse(course) }, color = colors[allCourses.indexOf(course).coerceAtLeast(0) % colors.size], shape = RoundedCornerShape(8.dp), modifier = Modifier.offset(x = if (collapse) 0.dp else laneWidth * placement.lane, y = ((span.first - 1) * 64).dp).width(laneWidth).padding(end = if (!collapse && placement.laneCount > 1) 2.dp else 0.dp).height(((span.last - span.first + 1) * 64 - 4).dp)) {
                    Column(Modifier.padding(horizontal = 3.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (collapse && group.size > 1) Text("+${group.size - 1}", Modifier.align(Alignment.End), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Text(course.text("name"), fontWeight = FontWeight.Bold, fontSize = 10.sp, lineHeight = 14.sp, maxLines = 3, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall.copy(lineBreak = LineBreak.Heading))
                        Text(course.text("location"), fontSize = 8.sp, lineHeight = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}
