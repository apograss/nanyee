package de.nanyee.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder

@Composable
internal fun ClassroomScreen(school: SchoolState, rain: RainState, rainDemo: Boolean, toggleRainDemo: () -> Unit) {
    val platformState = rememberSaveableStateHolder()
    platformState.SaveableStateProvider(school.classroomPlatform.name) {
        val back = { school.selectTab(0) }
        when (school.classroomPlatform) {
            ClassroomPlatform.XUEXITONG -> XxtToolsScreen(onBack = back)
            ClassroomPlatform.RAIN -> RainToolsScreen(rain, rainDemo, onBack = back, toggleDemo = toggleRainDemo)
        }
    }
}
