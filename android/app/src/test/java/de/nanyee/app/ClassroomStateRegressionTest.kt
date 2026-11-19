package de.nanyee.app

import android.app.Application
import androidx.lifecycle.ViewModelStore
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
}
