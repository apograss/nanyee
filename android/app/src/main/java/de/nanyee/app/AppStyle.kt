package de.nanyee.app

import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun NanyeeTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) darkColorScheme(
        primary = Color(0xFFD97757), onPrimary = Color(0xFF1F1E1D), primaryContainer = Color(0xFF4A2C20), onPrimaryContainer = Color(0xFFF6E3DA),
        secondary = Color(0xFF9CAB88), onSecondary = Color(0xFF1F2818), secondaryContainer = Color(0xFF343D2D), onSecondaryContainer = Color(0xFFE4E8D9),
        tertiary = Color(0xFFD2AC65), onTertiary = Color(0xFF30230B), tertiaryContainer = Color(0xFF493F29), onTertiaryContainer = Color(0xFFF2E5C8),
        background = Color(0xFF1F1E1D), onBackground = Color(0xFFECEAE3), surface = Color(0xFF2A2927), surfaceVariant = Color(0xFF34332F), onSurface = Color(0xFFECEAE3), onSurfaceVariant = Color(0xFFA09D94),
        surfaceContainerLowest = Color(0xFF1F1E1D), surfaceContainerLow = Color(0xFF2A2927), surfaceContainer = Color(0xFF2A2927), surfaceContainerHigh = Color(0xFF34332F), surfaceContainerHighest = Color(0xFF403E38), outline = Color(0xFF625E55), outlineVariant = Color(0xFF47443D), surfaceTint = Color(0xFFD97757)
    ) else lightColorScheme(
        primary = Color(0xFFC96442), onPrimary = Color.White, primaryContainer = Color(0xFFF6E3DA), onPrimaryContainer = Color(0xFF5A2A18),
        secondary = Color(0xFF7D8F69), onSecondary = Color.White, secondaryContainer = Color(0xFFE4E8D9), onSecondaryContainer = Color(0xFF354329),
        tertiary = Color(0xFFC99A3E), onTertiary = Color(0xFF332609), tertiaryContainer = Color(0xFFF2E5C8), onTertiaryContainer = Color(0xFF594416),
        background = Color(0xFFFAF9F5), onBackground = Color(0xFF1F1E1D), surface = Color.White, surfaceVariant = Color(0xFFF0EEE6), onSurface = Color(0xFF1F1E1D), onSurfaceVariant = Color(0xFF6B6862),
        surfaceContainerLowest = Color.White, surfaceContainerLow = Color.White, surfaceContainer = Color(0xFFF0EEE6), surfaceContainerHigh = Color(0xFFEAE7DE), surfaceContainerHighest = Color(0xFFE3DFD3), outline = Color(0xFFE3DFD3), outlineVariant = Color(0xFFE3DFD3), surfaceTint = Color(0xFFC96442)
    )
    MaterialTheme(colorScheme = colors, typography = Typography(
        displayLarge = MaterialTheme.typography.displayLarge.copy(fontFamily = FontFamily.Serif),
        displayMedium = MaterialTheme.typography.displayMedium.copy(fontFamily = FontFamily.Serif),
        displaySmall = MaterialTheme.typography.displaySmall.copy(fontFamily = FontFamily.Serif),
        headlineLarge = MaterialTheme.typography.headlineLarge.copy(fontFamily = FontFamily.Serif, fontSize = 28.sp, lineHeight = 34.sp, fontWeight = FontWeight.Bold),
        headlineMedium = MaterialTheme.typography.headlineMedium.copy(fontFamily = FontFamily.Serif, fontSize = 25.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold),
        headlineSmall = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Serif, fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
        titleLarge = MaterialTheme.typography.titleLarge.copy(fontFamily = FontFamily.Serif, fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
        titleMedium = MaterialTheme.typography.titleMedium.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.SemiBold),
        titleSmall = MaterialTheme.typography.titleSmall.copy(fontFamily = FontFamily.Serif),
        bodyLarge = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp, lineHeight = 22.sp),
        bodyMedium = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp)
    ), shapes = Shapes(small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(14.dp), large = RoundedCornerShape(18.dp)), content = content)
}

internal enum class SectionAccent { BRAND, ACADEMIC, SERVICE, SAGE, PLUM }

internal fun courseFill(name: String, dark: Boolean): Color {
    val colors = if (dark) listOf(0xFF4A342B, 0xFF343D2D, 0xFF303947, 0xFF493F29, 0xFF443241, 0xFF42382F) else listOf(0xFFEEDACF, 0xFFE4E8D9, 0xFFE0E4ED, 0xFFF2E5C8, 0xFFEADFE8, 0xFFEEE1D4)
    return Color(colors[coursePaletteIndex(name)])
}

@Composable
internal fun CourseHeading(name: String, teacher: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(shape = RoundedCornerShape(12.dp), color = courseFill(name, isSystemInDarkTheme())) {
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
    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.onPrimaryContainer) {
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
internal fun ToolGrid(tiles: List<ToolTile>) {
    val scale = LocalDensity.current.fontScale
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val columns = toolColumnCount(maxWidth.value, scale).coerceAtMost(tiles.size.coerceAtLeast(1))
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            tiles.chunked(columns).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { tile ->
                        val interactions = remember { MutableInteractionSource() }
                        val pressed by interactions.collectIsPressedAsState()
                        Card(onClick = tile.onClick, modifier = Modifier.weight(1f), interactionSource = interactions,
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), elevation = CardDefaults.cardElevation(defaultElevation = if (pressed) 3.dp else 0.dp, pressedElevation = 3.dp)) {
                            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                AccentIcon(tile.icon, tile.accent)
                                Text(tile.title, style = MaterialTheme.typography.titleLarge)
                                Text(tile.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                if (tile.status.isNotBlank()) Text(tile.status, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                    repeat(columns - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
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
    val colors = MaterialTheme.colorScheme
    val dark = isSystemInDarkTheme()
    val background = when (accent) { SectionAccent.BRAND -> colors.primaryContainer; SectionAccent.ACADEMIC -> if (dark) Color(0xFF303947) else Color(0xFFE0E4ED); SectionAccent.SERVICE -> colors.tertiaryContainer; SectionAccent.SAGE -> colors.secondaryContainer; SectionAccent.PLUM -> if (dark) Color(0xFF443241) else Color(0xFFEADFE8) }
    val foreground = when (accent) { SectionAccent.BRAND -> colors.onPrimaryContainer; SectionAccent.ACADEMIC -> if (dark) Color(0xFFB5C3DE) else Color(0xFF6A7FA8); SectionAccent.SERVICE -> colors.onTertiaryContainer; SectionAccent.SAGE -> colors.onSecondaryContainer; SectionAccent.PLUM -> if (dark) Color(0xFFD8BCD5) else Color(0xFF8E6C8A) }
    Surface(shape = RoundedCornerShape(12.dp), color = background, contentColor = foreground) {
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
