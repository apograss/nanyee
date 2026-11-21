package de.nanyee.app

import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun OpenSourceLicenses(onClose: () -> Unit) {
    val context = LocalContext.current
    val files = listOf("NOTICE", "LICENSE", "THIRD_PARTY_NOTICES.txt")
    val labels = listOf("声明", "GPL-3.0", "第三方")
    var selected by remember { mutableIntStateOf(0) }
    var text by remember { mutableStateOf("") }
    LaunchedEffect(selected) {
        text = ""
        text = withContext(Dispatchers.IO) {
            runCatching { context.assets.open(files[selected]).bufferedReader().use { it.readText() } }.getOrDefault("暂时无法读取许可")
        }
    }
    AlertDialog(onDismissRequest = onClose, title = { Text("开源许可") },
        text = {
            Column {
                TabRow(selectedTabIndex = selected) {
                    labels.forEachIndexed { index, label -> Tab(selected = selected == index, onClick = { selected = index }, text = { Text(label) }) }
                }
                key(selected) {
                    LazyColumn(Modifier.heightIn(max = 400.dp).padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(text.split("\n\n")) { paragraph ->
                            Text(paragraph, style = MaterialTheme.typography.bodySmall, fontFamily = FontFamily.Monospace)
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { openAppLink(context, "https://github.com/apograss/nanyee") }) { Text("源码与许可") } },
        dismissButton = { TextButton(onClick = onClose) { Text("关闭") } })
}
