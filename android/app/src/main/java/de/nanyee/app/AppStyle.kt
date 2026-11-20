package de.nanyee.app

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.ArrowDropDown
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun NanyeeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = inkColors, typography = Typography(
        displayLarge = MaterialTheme.typography.displayLarge.copy(fontWeight = FontWeight.Black, letterSpacing = (-2).sp),
        displayMedium = MaterialTheme.typography.displayMedium.copy(fontWeight = FontWeight.Black, letterSpacing = (-1.5).sp),
        displaySmall = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.ExtraBold, letterSpacing = (-1).sp),
        headlineLarge = MaterialTheme.typography.headlineLarge.copy(fontSize = 30.sp, lineHeight = 36.sp, fontWeight = FontWeight.ExtraBold, letterSpacing = (-1).sp),
        headlineMedium = MaterialTheme.typography.headlineMedium.copy(fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.7).sp),
        headlineSmall = MaterialTheme.typography.headlineSmall.copy(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
        titleLarge = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.Bold),
        titleMedium = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        labelSmall = MaterialTheme.typography.labelSmall.copy(letterSpacing = 1.sp, fontSize = 10.sp),
        bodyLarge = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp, lineHeight = 22.sp),
        bodyMedium = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp)
    ), shapes = Shapes(small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(14.dp), large = RoundedCornerShape(18.dp)), content = content)
}

internal val InkBase = Color(0xFF12111C)
internal val InkSurface = Color(0xFF1B1A29)
internal val InkRaised = Color(0xFF24233A)
internal val InkHairline = Color(0xFF2F2E48)
internal val InkText = Color(0xFFF3F1FA)
internal val InkMuted = Color(0xFF9A97B5)
internal val InkAccent = Color(0xFFFF6B3D)
internal val InkLive = Color(0xFFC8F560)
internal val inkColors = darkColorScheme(
    primary = InkAccent, onPrimary = InkBase, primaryContainer = Color(0xFF512A28), onPrimaryContainer = InkText,
    secondary = Color(0xFFB39DFF), onSecondary = InkBase, secondaryContainer = InkRaised, onSecondaryContainer = InkText,
    tertiary = Color(0xFF5ED6C9), onTertiary = InkBase, tertiaryContainer = InkRaised, onTertiaryContainer = InkText,
    background = InkBase, onBackground = InkText, surface = InkSurface, onSurface = InkText, surfaceVariant = InkBase, onSurfaceVariant = InkMuted,
    surfaceContainerLowest = InkBase, surfaceContainerLow = InkSurface, surfaceContainer = InkRaised, surfaceContainerHigh = InkRaised,
    surfaceContainerHighest = InkHairline, outline = InkHairline, outlineVariant = InkHairline, surfaceTint = Color.Transparent,
    inverseSurface = InkText, inverseOnSurface = InkBase, inversePrimary = InkAccent
)
internal enum class SectionAccent { BRAND, ACADEMIC, SERVICE, SAGE, PLUM }

internal fun courseAccent(name: String) = Color(listOf(0xFFFF8A65, 0xFFB39DFF, 0xFF5ED6C9, 0xFF6FB3FF, 0xFFFF7EB6, 0xFFF6C35B, 0xFF8EE6A0)[coursePaletteIndex(name)])
internal fun courseFill(name: String) = courseAccent(name).copy(alpha = 0.22f)
internal fun sectionColor(accent: SectionAccent) = when (accent) { SectionAccent.BRAND -> InkAccent; SectionAccent.ACADEMIC -> Color(0xFF6FB3FF); SectionAccent.SERVICE -> Color(0xFFB39DFF); SectionAccent.SAGE -> Color(0xFF5ED6C9); SectionAccent.PLUM -> Color(0xFFFF7EB6) }

@Composable
internal fun CourseHeading(name: String, teacher: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(shape = RoundedCornerShape(12.dp), color = courseFill(name), contentColor = courseAccent(name)) {
            Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { Text(name.take(1), style = MaterialTheme.typography.titleLarge) }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(name, style = MaterialTheme.typography.titleMedium)
            Text(teacher.ifBlank { "教师信息暂未提供" }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun ProfileHero(name: String, subtitle: String, initial: String, badge: String) {
    Surface(shape = MaterialTheme.shapes.large, color = InkRaised, contentColor = InkText) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.surface) {
                Box(Modifier.size(52.dp), contentAlignment = Alignment.Center) { Text(initial, style = MaterialTheme.typography.headlineSmall) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(name, style = MaterialTheme.typography.headlineSmall)
                Text(subtitle, style = MaterialTheme.typography.bodySmall)
                Text(badge, style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

internal data class ToolTile(val title: String, val description: String, val icon: ImageVector, val accent: SectionAccent, val status: String = "", val onClick: () -> Unit)

@Composable
internal fun ToolGrid(tiles: List<ToolTile>, wideFirst: Boolean = false) {
    val scale = LocalDensity.current.fontScale
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val columns = toolColumnCount(maxWidth.value, scale).coerceAtMost(tiles.size.coerceAtLeast(1))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (wideFirst && tiles.isNotEmpty()) SignalToolTile(tiles.first(), Modifier.fillMaxWidth(), hero = true)
            (if (wideFirst) tiles.drop(1) else tiles).chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { tile ->
                        SignalToolTile(tile, Modifier.weight(1f))
                    }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun SignalToolTile(tile: ToolTile, modifier: Modifier, hero: Boolean = false) {
    val interactions = remember { MutableInteractionSource() }
    val pressed by interactions.collectIsPressedAsState()
    val accent = if (hero) InkAccent else sectionColor(tile.accent)
    Card(onClick = tile.onClick, modifier = modifier, interactionSource = interactions, colors = CardDefaults.cardColors(containerColor = InkRaised), elevation = CardDefaults.cardElevation(defaultElevation = if (pressed) 4.dp else 0.dp)) {
        Column(Modifier.fillMaxWidth().background(Brush.linearGradient(listOf(accent.copy(alpha = 0.18f), InkRaised))).padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Icon(tile.icon, null, Modifier.size(if (hero) 36.dp else 42.dp), tint = accent)
                Icon(Icons.Outlined.ChevronRight, null, Modifier.size(20.dp), tint = InkMuted)
            }
            if (hero) Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(if (tile.status.startsWith("GPA ")) tile.status.removePrefix("GPA ") else "—", style = MaterialTheme.typography.displayMedium.copy(fontFeatureSettings = "tnum"))
                Text("GPA / ${tile.title}", Modifier.padding(bottom = 8.dp), style = MaterialTheme.typography.labelMedium, color = InkMuted)
            } else Text(tile.title, style = MaterialTheme.typography.titleLarge)
            Text(if (hero) tile.description else tile.status.ifBlank { tile.description }, style = MaterialTheme.typography.bodySmall, color = InkMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
internal fun ScenarioPicker(label: String, choices: List<String>, enabled: Boolean = true, select: (Int) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        AssistChip(onClick = { expanded = true }, enabled = enabled, label = { Text("演示场景 · $label") }, trailingIcon = { Icon(Icons.Outlined.ArrowDropDown, null) })
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            choices.forEachIndexed { index, title -> DropdownMenuItem(text = { Text(title) }, onClick = { expanded = false; select(index) }, enabled = enabled) }
        }
    }
}

@Composable
internal fun ClassroomAccountRow(name: String, platform: String, demo: Boolean, enabled: Boolean, signedIn: Boolean, logout: () -> Unit, toggleDemo: () -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.medium) {
        Row(Modifier.fillMaxWidth().padding(start = 12.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AccentIcon(Icons.Outlined.Person, SectionAccent.ACADEMIC)
            Text(name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.small) { Text(if (demo) "演示" else platform, Modifier.padding(horizontal = 6.dp, vertical = 3.dp), style = MaterialTheme.typography.labelSmall) }
            Box {
                IconButton(onClick = { expanded = true }, enabled = enabled) { Icon(Icons.Outlined.MoreHoriz, "$platform 账号操作") }
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    if (signedIn) DropdownMenuItem(text = { Text("退出并清除${platform}数据") }, onClick = { expanded = false; logout() })
                    DropdownMenuItem(text = { Text(if (demo) "返回真实$platform" else "无账号体验离线演示") }, onClick = { expanded = false; toggleDemo() })
                }
            }
        }
    }
}

@Composable
internal fun AccentIcon(icon: ImageVector, accent: SectionAccent, description: String? = null) {
    val foreground = sectionColor(accent)
    Surface(shape = RoundedCornerShape(12.dp), color = foreground.copy(alpha = 0.16f), contentColor = foreground) {
        Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { Icon(icon, description, Modifier.size(23.dp)) }
    }
}

@Composable
internal fun SectionHeading(title: String, subtitle: String, icon: ImageVector, accent: SectionAccent = SectionAccent.BRAND) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        AccentIcon(icon, accent)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun CompactEntry(title: String, subtitle: String, icon: ImageVector, accent: SectionAccent, enabled: Boolean = true, onClick: () -> Unit) {
    Card(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AccentIcon(icon, accent)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(20.dp))
        }
    }
}
