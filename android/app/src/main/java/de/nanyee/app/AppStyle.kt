package de.nanyee.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun NanyeeTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) darkColorScheme(
        primary = Color(0xFF94D5C7), onPrimary = Color(0xFF00382E), primaryContainer = Color(0xFF155044), onPrimaryContainer = Color(0xFFB0F1E2),
        secondary = Color(0xFFBBC6EB), onSecondary = Color(0xFF25304E), secondaryContainer = Color(0xFF35415F), onSecondaryContainer = Color(0xFFDCE2FF),
        tertiary = Color(0xFFE2C28D), onTertiary = Color(0xFF412D08), tertiaryContainer = Color(0xFF594322), onTertiaryContainer = Color(0xFFFFDFA6),
        background = Color(0xFF101513), surface = Color(0xFF101513), onSurface = Color(0xFFE1E7E2), onSurfaceVariant = Color(0xFFB5C2BB),
        surfaceContainerLowest = Color(0xFF0B100E), surfaceContainerLow = Color(0xFF19211E), surfaceContainer = Color(0xFF202925), surfaceContainerHigh = Color(0xFF29332E), surfaceContainerHighest = Color(0xFF333E38), outlineVariant = Color(0xFF3F4B44)
    ) else lightColorScheme(
        primary = Color(0xFF176B5B), onPrimary = Color.White, primaryContainer = Color(0xFFD2ECE1), onPrimaryContainer = Color(0xFF064E40),
        secondary = Color(0xFF505F88), onSecondary = Color.White, secondaryContainer = Color(0xFFE3E9FB), onSecondaryContainer = Color(0xFF34456B),
        tertiary = Color(0xFF805F2D), onTertiary = Color.White, tertiaryContainer = Color(0xFFF6E7CA), onTertiaryContainer = Color(0xFF614618),
        background = Color(0xFFF5F8F5), surface = Color(0xFFF5F8F5), onSurface = Color(0xFF1A2923), onSurfaceVariant = Color(0xFF53665B),
        surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFEDF3EE), surfaceContainer = Color(0xFFE5EDE7), surfaceContainerHigh = Color(0xFFDDE7E0), surfaceContainerHighest = Color(0xFFD6E2DA), outlineVariant = Color(0xFFC3D1C7)
    )
    MaterialTheme(colorScheme = colors, typography = Typography(
        headlineLarge = MaterialTheme.typography.headlineLarge.copy(fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.Bold),
        headlineMedium = MaterialTheme.typography.headlineMedium.copy(fontSize = 24.sp, lineHeight = 30.sp, fontWeight = FontWeight.Bold),
        headlineSmall = MaterialTheme.typography.headlineSmall.copy(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold),
        titleLarge = MaterialTheme.typography.titleLarge.copy(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
        titleMedium = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        bodyLarge = MaterialTheme.typography.bodyLarge.copy(fontSize = 15.sp, lineHeight = 22.sp),
        bodyMedium = MaterialTheme.typography.bodyMedium.copy(fontSize = 14.sp, lineHeight = 20.sp)
    ), shapes = Shapes(small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(14.dp), large = RoundedCornerShape(18.dp)), content = content)
}

internal enum class SectionAccent { BRAND, ACADEMIC, SERVICE }

@Composable
internal fun AccentIcon(icon: ImageVector, accent: SectionAccent, description: String? = null) {
    val colors = MaterialTheme.colorScheme
    val background = when (accent) { SectionAccent.BRAND -> colors.primaryContainer; SectionAccent.ACADEMIC -> colors.secondaryContainer; SectionAccent.SERVICE -> colors.tertiaryContainer }
    val foreground = when (accent) { SectionAccent.BRAND -> colors.onPrimaryContainer; SectionAccent.ACADEMIC -> colors.onSecondaryContainer; SectionAccent.SERVICE -> colors.onTertiaryContainer }
    Surface(shape = CircleShape, color = background, contentColor = foreground) {
        Box(Modifier.size(36.dp), contentAlignment = Alignment.Center) { Icon(icon, description, Modifier.size(20.dp)) }
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
