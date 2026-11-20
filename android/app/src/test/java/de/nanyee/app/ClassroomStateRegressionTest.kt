package de.nanyee.app

import android.app.Application
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.compose.runtime.MutableState
import kotlinx.coroutines.*
import kotlin.coroutines.CoroutineContext
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.TemporaryFolder

class ClassroomStateRegressionTest {
    @get:Rule val photos = TemporaryFolder()
    private fun application(): Application {
        val unsafe = Class.forName("sun.misc.Unsafe")
        val field = unsafe.getDeclaredField("theUnsafe").apply { isAccessible = true }
        return unsafe.getMethod("allocateInstance", Class::class.java).invoke(field.get(null), Application::class.java) as Application
    }
    private fun synchronousScope(state: ViewModel) {
        val scope = Class.forName("androidx.lifecycle.viewmodel.internal.CloseableCoroutineScope")
            .getConstructor(CoroutineContext::class.java).newInstance(Dispatchers.Unconfined + Job()) as AutoCloseable
        state.addCloseable("androidx.lifecycle.viewmodel.internal.ViewModelCoroutineScope.JOB_KEY", scope)
    }
    @Suppress("UNCHECKED_CAST")
    private fun setState(state: Any, name: String, value: Any?) {
        val field = state.javaClass.getDeclaredField("${name}\$delegate").apply { isAccessible = true }
        (field.get(state) as MutableState<Any?>).value = value
    }

    @Test fun clearingUnusedRainStateDoesNotReadUninitializedBackend() {
        val store = ViewModelStore()
        store.put("unused-rain", RainState(application()))
        store.clear()
    }
    @Test fun rainQrSurvivesRecreationAndBackgroundButLeavingCancelsIt() = runBlocking<Unit> {
        val state = RainState(application()); synchronousScope(state)
        setState(state, "ready", true)
        setState(state, "qr", RainQr("token", "content"))
        val backend = object : RainBackend by DemoRainBackend(RainHost.CHANGJIANG) {
            override suspend fun poll(qr: RainQr): Boolean = awaitCancellation()
        }
        RainState::class.java.getDeclaredField("backend").apply { isAccessible = true }.set(state, backend)
        state.setVisible(true); state.setForeground(true)
        val visible = RainState::class.java.getDeclaredField("visibleWork").apply { isAccessible = true }
        val pending = visible.get(state) as Job
        assertTrue(pending.isActive)
        val original = state.qr
        state.setForeground(false, changingConfigurations = true)
        state.setVisible(false, changingConfigurations = true)
        state.setVisible(true); state.setForeground(true)
        assertSame(original, state.qr); assertSame(pending, visible.get(state))
        assertEquals(0L, RainState::class.java.getDeclaredField("backgroundUntil").apply { isAccessible = true }.getLong(state))
        val before = System.currentTimeMillis()
        state.setForeground(false)
        assertSame(pending, visible.get(state)); assertTrue(pending.isActive)
        val until = RainState::class.java.getDeclaredField("backgroundUntil").apply { isAccessible = true }.getLong(state)
        assertTrue(until >= before + 60000)
        state.setForeground(true); assertSame(pending, visible.get(state)); assertTrue(pending.isActive)
        state.setVisible(false); assertTrue(pending.isCancelled); assertNull(state.qr)
        ViewModelStore().also { it.put("rain", state); it.clear() }
    }
    @Test fun rainSmsRecreationPreservesProofCountdownAndEnteredCode() = runBlocking<Unit> {
        val state = RainState(application()); synchronousScope(state)
        setState(state, "ready", true)
        RainState::class.java.getDeclaredField("backend").apply { isAccessible = true }.set(state, DemoRainBackend(RainHost.CHANGJIANG))
        state.setVisible(true); state.setForeground(true)
        state.selectLoginMethod(RainLoginMethod.SMS)
        state.loginAccount = "13800138000"; state.loginSecret = "123456"
        val proof = RainCaptchaProof("ticket", "rand")
        RainState::class.java.getDeclaredField("smsProof").apply { isAccessible = true }.set(state, proof)
        RainState::class.java.getDeclaredField("smsPhone").apply { isAccessible = true }.set(state, state.loginAccount)
        val deadline = System.currentTimeMillis() + 60000
        setState(state, "smsDeadline", deadline)
        state.setForeground(false, changingConfigurations = true)
        state.setVisible(false, changingConfigurations = true)
        state.setVisible(true); state.setForeground(true)
        assertEquals(RainLoginMethod.SMS, state.loginMethod)
        assertEquals("13800138000", state.loginAccount); assertEquals("123456", state.loginSecret)
        assertEquals(deadline, state.smsDeadline)
        assertSame(proof, RainState::class.java.getDeclaredField("smsProof").apply { isAccessible = true }.get(state))
        state.setVisible(false)
        assertEquals(0L, state.smsDeadline); assertEquals("", state.loginSecret)
        assertNull(RainState::class.java.getDeclaredField("smsProof").apply { isAccessible = true }.get(state))
        ViewModelStore().also { it.put("rain", state); it.clear() }
    }
    @Test fun rainQrTimeoutAndOtherPollFailuresRenewBeforeFetchingProfile() = runBlocking<Unit> {
        for (failure in listOf("NETWORK", "SESSION", "FORMAT", "UPSTREAM", "REDIRECT")) {
        val state = RainState(application()); synchronousScope(state)
        setState(state, "ready", true); setState(state, "qr", RainQr("initial", "content"))
        var polls = 0; var refreshes = 0
        val profile = CompletableDeferred<Unit>()
        val backend = object : RainBackend by DemoRainBackend(RainHost.CHANGJIANG) {
            override suspend fun qr(): RainQr { refreshes++; return RainQr("renewed", "content") }
            override suspend fun poll(qr: RainQr): Boolean { if (polls++ == 0) throw RainFailure(failure, "扫码等待未完成"); return true }
            override suspend fun user(): RainUser { profile.complete(Unit); return RainUser("1001", "demo") }
        }
        RainState::class.java.getDeclaredField("store").apply { isAccessible = true }.set(state, MemoryRainStore())
        RainState::class.java.getDeclaredField("backend").apply { isAccessible = true }.set(state, backend)
        state.setVisible(true); state.setForeground(true)
        withTimeout(5000) { profile.await() }
        assertEquals(1, refreshes); assertEquals(2, polls)
        state.setVisible(false); ViewModelStore().also { it.put("rain", state); it.clear() }
        }
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

    @Test fun unknownWriteSurvivesBackReopenAndRestorationUntilAcknowledged() = runBlocking<Unit> {
        val saved = SavedStateHandle()
        val state = XxtState(application(), saved)
        synchronousScope(state)
        setState(state, "demo", true)
        val backend = DemoXxtBackend()
        XxtState::class.java.getDeclaredField("backend").apply { isAccessible = true }.set(state, backend)
        XxtState::class.java.getDeclaredField("pendingWrite").apply { isAccessible = true }.set(state, true)
        val course = backend.courses().first()
        val activity = backend.activities(course).first()
        state.selectCourse(course)
        state.selectActivity(activity)
        state.back()
        assertTrue(state.hasUnknownWrite)
        state.selectActivity(activity)
        assertTrue(state.completed)
        val restored = XxtState(application(), saved)
        synchronousScope(restored)
        restored.initialize(true)
        val work = XxtState::class.java.getDeclaredField("work").apply { isAccessible = true }
        withTimeout(5000) { (work.get(restored) as Job).join() }
        assertTrue(restored.hasUnknownWrite)
        restored.acknowledgeUnknown()
        withTimeout(5000) { (work.get(restored) as Job).join() }
        assertFalse(restored.hasUnknownWrite)
        assertFalse(restored.completed)
        ViewModelStore().apply { put("first", state); put("restored", restored); clear() }
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

    @Test fun resumingFollowLoadsLiveDeckAndCancelsInFlightHistoricalLoad() {
        val state = RainState(application())
        synchronousScope(state)
        val waiting = CompletableDeferred<RainPresentation>()
        val backend = object : RainBackend by DemoRainBackend(RainHost.WWW) {
            override suspend fun presentation(lesson: RainLesson, id: String): RainPresentation {
                if (id == "waiting") return waiting.await()
                return RainPresentation(id, id, (1..4).map { RainSlide("$id-$it", it, "") })
            }
        }
        RainState::class.java.getDeclaredField("backend").apply { isAccessible = true }.set(state, backend)
        setState(state, "lesson", RainLesson(RainHost.WWW, "owner", "lesson", "bearer", "token"))
        val accept = RainState::class.java.getDeclaredMethod("accept", RainFrame::class.java).apply { isAccessible = true }
        accept.invoke(state, RainFrame("hello", "first", 1))
        state.selectEvent(RainEvent("slide", "old", 1, "historical", 1))
        accept.invoke(state, RainFrame("showpresentation", "live", 2))
        assertEquals("historical", state.presentation?.id)
        state.updateFollow(true)
        assertEquals("live", state.presentation?.id)
        assertEquals(1, state.slide)
        accept.invoke(state, RainFrame("slidenav", slide = 3))
        assertEquals("live", state.presentation?.id)
        assertEquals(2, state.slide)
        state.selectEvent(RainEvent("slide", "waiting", 1, "waiting", 1))
        state.updateFollow(true)
        waiting.complete(RainPresentation("waiting", "waiting", emptyList()))
        assertEquals("live", state.presentation?.id)
        assertEquals(2, state.slide)
        ViewModelStore().apply { put("rain", state); clear() }
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
