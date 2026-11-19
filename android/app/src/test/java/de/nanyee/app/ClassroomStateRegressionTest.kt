package de.nanyee.app

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.SavedStateHandle
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import sun.misc.Unsafe

class ClassroomStateRegressionTest {
    @get:Rule val photos = TemporaryFolder()
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

    @Test fun followingRestoresLatestPresentationAndNotTheHistoricalDeck() {
        val slides = RainLiveSlides()
        assertNull(slides.target)
        assertFalse(slides.accept(RainFrame("slidenav", slide = 3)))
        slides.accept(RainFrame("hello", "first", 1))
        slides.accept(RainFrame("showpresentation", "live", 2))
        slides.accept(RainFrame("slidenav", slide = 4))
        assertEquals("live" to 4, slides.target)
        assertFalse(slides.accept(RainFrame("unlockproblem", "historical", 1)))
        assertEquals("live" to 4, slides.target)
        slides.clear()
        assertNull(slides.target)
    }

    @Test fun discardedPhotosAreDeletedButUnresolvedEvidenceIsRetained() {
        val old = photos.newFile("xxt_photo_old.jpg")
        val replacement = photos.newFile("xxt_demo_photo_new.jpg")
        assertEquals("", xxtDiscardPhoto(old.path, photos.root, false))
        assertFalse(old.exists())
        assertTrue(replacement.exists())
        assertEquals(replacement.path, xxtDiscardPhoto(replacement.path, photos.root, true))
        assertTrue(replacement.exists())
        assertEquals("", xxtDiscardPhoto(replacement.path, photos.root, false))
        assertFalse(replacement.exists())
        assertEquals("", xxtDiscardPhoto("", photos.root, false))
    }

    @Test fun discardedPhotoCannotDeleteUnrelatedOrOutsideFiles() {
        val other = photos.newFile("unrelated.jpg")
        val outside = java.io.File(photos.newFolder("other"), "xxt_photo_other.jpg").apply { createNewFile() }
        xxtDiscardPhoto(other.path, photos.root, false)
        xxtDiscardPhoto(outside.path, photos.root, false)
        assertTrue(other.exists())
        assertTrue(outside.exists())
    }
}
