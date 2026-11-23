package de.nanyee.app

import android.app.Application
import androidx.compose.runtime.MutableState
import androidx.lifecycle.ViewModelStore
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import kotlin.coroutines.CoroutineContext

class RainRefreshTest {
    private fun state(backend: RainBackend): RainState {
        val unsafe = Class.forName("sun.misc.Unsafe")
        val singleton = unsafe.getDeclaredField("theUnsafe").apply { isAccessible = true }.get(null)
        val app = unsafe.getMethod("allocateInstance", Class::class.java).invoke(singleton, Application::class.java) as Application
        val state = RainState(app)
        val scope = Class.forName("androidx.lifecycle.viewmodel.internal.CloseableCoroutineScope")
            .getConstructor(CoroutineContext::class.java).newInstance(Dispatchers.Unconfined + Job()) as AutoCloseable
        state.addCloseable("androidx.lifecycle.viewmodel.internal.ViewModelCoroutineScope.JOB_KEY", scope)
        state.field("backend", backend)
        state.field("store", MemoryRainStore())
        state.value("ready", true)
        return state
    }
    private fun RainState.field(name: String, value: Any) {
        RainState::class.java.getDeclaredField(name).apply { isAccessible = true }.set(this, value)
    }
    @Suppress("UNCHECKED_CAST")
    private fun RainState.value(name: String, value: Any) {
        (RainState::class.java.getDeclaredField("$name\$delegate").apply { isAccessible = true }.get(this) as MutableState<Any>).value = value
    }
    private suspend fun RainState.finished() {
        val job = RainState::class.java.getDeclaredField("work").apply { isAccessible = true }.get(this) as Job
        withTimeout(5000) { job.join() }
    }

    @Test fun refreshReloadsCoursewareAndReconnectsWithoutRepeatingJoin() = runBlocking<Unit> {
        var reloads = 0
        var connections = 0
        val demo = DemoRainBackend(RainHost.WWW)
        val joined = demo.join(demo.user(), "lesson1")
        val updated = RainPresentation("deck", "Updated", emptyList())
        val backend = object : RainBackend by demo {
            override suspend fun presentation(lesson: RainLesson, id: String): RainPresentation {
                assertEquals(joined, lesson); assertEquals("deck", id); reloads++
                return updated
            }
            override fun connect(lesson: RainLesson, frame: (RainFrame) -> Unit, ended: () -> Unit): RainLive {
                connections++
                return object : RainLive { override fun close() {} }
            }
        }
        val state = state(backend)
        state.value("lesson", joined)
        state.value("presentation", RainPresentation("deck", "Old", emptyList()))
        state.field("foreground", true); state.field("screenVisible", true)
        state.refreshClassroom(); state.finished()
        assertEquals(1, reloads); assertEquals(1, connections)
        assertSame(updated, state.presentation); assertEquals(0, state.slide)
        assertEquals(listOf("JOIN"), demo.writes)
        assertFalse(state.busy); assertEquals("", state.error)
        ViewModelStore().apply { put("rain", state); clear() }
    }

    @Test fun refreshBeforeCoursewareArrivesAndOutsideALessonIsSafe() = runBlocking<Unit> {
        val demo = DemoRainBackend(RainHost.WWW)
        val state = state(demo)
        state.refreshClassroom(); state.finished()
        assertNotNull(state.user); assertTrue(state.loaded)
        state.value("lesson", demo.join(demo.user(), "lesson1"))
        state.refreshClassroom(); state.finished()
        assertNull(state.presentation); assertEquals("", state.error); assertFalse(state.busy)
        ViewModelStore().apply { put("rain", state); clear() }
    }

    @Test fun refreshFailureKeepsThePreviousDeckAndReleasesTheBusyState() = runBlocking<Unit> {
        val demo = DemoRainBackend(RainHost.WWW)
        val backend = object : RainBackend by demo {
            override suspend fun presentation(lesson: RainLesson, id: String): RainPresentation = throw RainFailure("NETWORK", "刷新失败")
        }
        val state = state(backend)
        val deck = RainPresentation("deck", "Old", emptyList())
        state.value("lesson", demo.join(demo.user(), "lesson1")); state.value("presentation", deck)
        state.refreshClassroom(); state.finished()
        assertSame(deck, state.presentation); assertEquals("刷新失败", state.error); assertFalse(state.busy)
        ViewModelStore().apply { put("rain", state); clear() }
    }
}
