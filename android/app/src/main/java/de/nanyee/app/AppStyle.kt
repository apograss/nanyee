package de.nanyee.app

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
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun NanyeeTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = appColors, typography = Typography(
        headlineLarge = MaterialTheme.typography.headlineLarge.copy(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.Normal),
        headlineMedium = MaterialTheme.typography.headlineMedium.copy(fontSize = 22.sp, fontWeight = FontWeight.Normal),
        headlineSmall = MaterialTheme.typography.headlineSmall.copy(fontSize = 20.sp, fontWeight = FontWeight.Normal),
        titleLarge = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp, fontWeight = FontWeight.Normal),
        titleMedium = MaterialTheme.typography.titleMedium.copy(fontSize = 16.sp, fontWeight = FontWeight.Normal),
        bodyLarge = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp),
        bodyMedium = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp),
        labelSmall = MaterialTheme.typography.labelSmall.copy(letterSpacing = 0.sp, fontSize = 11.sp)
    ), shapes = Shapes(small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(14.dp), large = RoundedCornerShape(18.dp)), content = content)
}

internal val AppBackground = Color(0xFFF5F6FA)
internal val AppSurface = Color.White
internal val AppCard = Color.White
internal val AppDivider = Color(0xFFE4E5EC)
internal val AppText = Color(0xFF242630)
internal val AppMuted = Color(0xFF696D7C)
internal val AppPrimary = Color(0xFF53649A)
internal val appColors = lightColorScheme(
    primary = AppPrimary, onPrimary = Color.White, primaryContainer = Color(0xFFE6EAF7), onPrimaryContainer = AppText,
    secondary = AppPrimary, onSecondary = AppBackground, secondaryContainer = Color(0xFFE6EAF7), onSecondaryContainer = AppText,
    tertiary = Color(0xFF347F85), onTertiary = AppBackground, tertiaryContainer = Color(0xFFE2EFEE), onTertiaryContainer = AppText,
    background = AppBackground, onBackground = AppText, surface = AppSurface, onSurface = AppText, surfaceVariant = AppBackground, onSurfaceVariant = AppMuted,
    surfaceContainerLowest = AppBackground, surfaceContainerLow = AppSurface, surfaceContainer = AppCard, surfaceContainerHigh = AppCard,
    surfaceContainerHighest = AppCard, outline = AppDivider, outlineVariant = AppDivider, surfaceTint = Color.Transparent,
    inverseSurface = AppText, inverseOnSurface = AppBackground, inversePrimary = AppPrimary
)
internal enum class SectionAccent { BRAND, ACADEMIC, SERVICE, SAGE, PLUM }

internal val TimetableTop = Color(0xFFECECF6)
internal val TimetableBottom = Color(0xFFCDDDEB)
internal fun courseAccent(name: String) = Color(listOf(0xFFB95763, 0xFF7961AB, 0xFF478B9B, 0xFF568ABB, 0xFFA95182, 0xFFC36D5D, 0xFF44866D)[coursePaletteIndex(name)])
internal fun courseFill(name: String) = courseAccent(name).copy(alpha = 0.85f)
internal fun courseAvatarFill(name: String) = lerp(courseAccent(name), Color.Black, 0.2f)
internal val CourseAvatarText = Color.White
internal fun sectionColor(accent: SectionAccent) = when (accent) { SectionAccent.BRAND -> AppPrimary; SectionAccent.ACADEMIC -> Color(0xFF4878B4); SectionAccent.SERVICE -> Color(0xFF7961AB); SectionAccent.SAGE -> Color(0xFF347F85); SectionAccent.PLUM -> Color(0xFFA95182) }

@Composable
internal fun CourseHeading(name: String, teacher: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(shape = RoundedCornerShape(12.dp), color = courseAvatarFill(name), contentColor = CourseAvatarText) {
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
    Surface(shape = MaterialTheme.shapes.large, color = AppCard, contentColor = AppText) {
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
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        tiles.forEach { tile ->
            Card(onClick = tile.onClick, modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(tile.icon, null, Modifier.size(24.dp), tint = sectionColor(tile.accent))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(tile.title, style = MaterialTheme.typography.titleMedium)
                        Text(tile.description, style = MaterialTheme.typography.bodySmall, color = AppMuted)
                        if (tile.status.startsWith("GPA ")) Text(tile.status, style = MaterialTheme.typography.bodySmall, color = AppMuted)
                    }
                    Icon(Icons.Outlined.ChevronRight, null, Modifier.size(18.dp), tint = AppMuted)
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
    val foreground = sectionColor(accent)
    Icon(icon, description, Modifier.size(24.dp), tint = foreground)
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
