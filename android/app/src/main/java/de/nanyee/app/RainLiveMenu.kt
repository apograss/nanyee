package de.nanyee.app

import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable

@Composable
internal fun RainLiveMenuItems(state: RainState, close: () -> Unit, switchAccount: () -> Unit, scenario: () -> Unit, acknowledgeUnknown: () -> Unit, toggleDemo: () -> Unit) {
    fun action(block: () -> Unit): () -> Unit = { close(); block() }
    if (state.unknownKey.isNotBlank()) DropdownMenuItem(text = { Text("已在官方核验结果…") }, enabled = !state.busy, onClick = action(acknowledgeUnknown))
    if (state.demo) DropdownMenuItem(text = { Text("演示场景 · ${state.scenario.label}") }, enabled = !state.busy, onClick = action(scenario))
    DropdownMenuItem(text = { Text(if (state.demo) "切换到真实登录" else "离线演示") }, enabled = !state.busy, onClick = action(toggleDemo))
    DropdownMenuItem(text = { Text("切换雨课堂账号") }, enabled = !state.busy, onClick = action(switchAccount))
    DropdownMenuItem(text = { Text("离开课堂") }, enabled = !state.busy, onClick = action(state::backToCourses))
}
