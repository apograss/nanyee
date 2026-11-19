package de.nanyee.app

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.SavedStateHandle
import org.junit.Assert.*
import org.junit.Test
import sun.misc.Unsafe

class ClassroomStateRegressionTest {
    private fun application(): Application {
        val field = Unsafe::class.java.getDeclaredField("theUnsafe").apply { isAccessible = true }
        return (field.get(null) as Unsafe).allocateInstance(Application::class.java) as Application
    }

    @Test fun clearingUnusedRainStateDoesNotReadUninitializedBackend() {
        val store = ViewModelStore()
        store.put("unused-rain", RainState(application()))
        store.clear()
    }

    @Test fun resettingActivityPreservesUnknownWriteAndBlocksNewActivity() {
        val state = XxtState(application(), SavedStateHandle())
        XxtState::class.java.getDeclaredField("pendingWrite").apply { isAccessible = true }.set(state, true)
        val reset = XxtState::class.java.getDeclaredMethod("resetSign").apply { isAccessible = true }
        repeat(3) {
            reset.invoke(state)
            assertTrue(state.hasUnknownWrite)
            assertTrue(state.completed)
            assertTrue(state.message.contains("官方学习通核验"))
        }
    }

    @Test fun resettingResolvedActivityAllowsFreshConfirmation() {
        val state = XxtState(application(), SavedStateHandle())
        XxtState::class.java.getDeclaredMethod("resetSign").apply { isAccessible = true }.invoke(state)
        assertFalse(state.hasUnknownWrite)
        assertFalse(state.completed)
    }
}
