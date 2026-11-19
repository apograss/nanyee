package de.nanyee.app

import kotlinx.coroutines.*
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.Assert.*
import org.junit.Test

class RainFlowTest {
    @Test fun cookiesPersistEncryptedStoreValuesButNeverCrossSelectedHosts() {
        val store = MemoryRainStore(); val www = "https://www.yuketang.cn/".toHttpUrl(); val pro = "https://pro.yuketang.cn/".toHttpUrl()
        val jar = RainCookies(store, RainHost.WWW)
        jar.saveFromResponse(www, listOf(requireNotNull(Cookie.parse(www, "sessionid=fixture; domain=yuketang.cn; path=/; secure; httponly"))))
        assertEquals("fixture", RainCookies(store, RainHost.WWW).loadForRequest(www).single().value)
        assertTrue(jar.loadForRequest(pro).isEmpty()); assertTrue(RainCookies(store, RainHost.PRO).loadForRequest(pro).isEmpty()); assertTrue(jar.loadForRequest("http://www.yuketang.cn/".toHttpUrl()).isEmpty())
    }
    @Test fun pathCookiesReplacementExpiryAndForeignDomainsAreHandled() {
        val store = MemoryRainStore(); val root = "https://www.yuketang.cn/".toHttpUrl(); val api = "https://www.yuketang.cn/api/x".toHttpUrl(); val jar = RainCookies(store, RainHost.WWW)
        jar.saveFromResponse(root, listOf(requireNotNull(Cookie.parse(api, "csrf=one; path=/api; secure"))))
        assertTrue(jar.loadForRequest(root).isEmpty()); assertEquals("one", RainCookies(store, RainHost.WWW).loadForRequest(api).single().value)
        jar.saveFromResponse(api, listOf(requireNotNull(Cookie.parse(api, "csrf=two; path=/api; secure")), Cookie.Builder().name("evil").value("x").domain("evil.example").build()))
        assertEquals("two", jar.loadForRequest(api).single().value)
        jar.saveFromResponse(api, listOf(requireNotNull(Cookie.parse(api, "csrf=; path=/api; max-age=0; secure"))))
        assertTrue(RainCookies(store, RainHost.WWW).loadForRequest(api).isEmpty())
    }
    @Test fun logoutAndDisabledJarsCannotRepopulateAnyHostSecrets() {
        val store = MemoryRainStore(); val url = "https://www.yuketang.cn/".toHttpUrl(); val jar = RainCookies(store, RainHost.WWW)
        val cookie = requireNotNull(Cookie.parse(url, "sessionid=fixture; secure; path=/"))
        jar.saveFromResponse(url, listOf(cookie)); store.write("owner.PRO", "1001"); store.write("drafts.WWW.1001.33", "manual draft")
        jar.disable(); store.clear(); jar.saveFromResponse(url, listOf(cookie))
        assertEquals("", store.read("cookies.WWW")); assertEquals("", store.read("owner.PRO")); assertEquals("", store.read("drafts.WWW.1001.33")); assertTrue(jar.loadForRequest(url).isEmpty())
    }
    @Test fun liveConnectionRequiresBothVisibleAndResumedAndLeavesOnEveryExit() {
        val owner = RainLiveOwner(); var opens = 0; var leaves = 0
        val open: (RainLesson) -> RainLive = { opens++; object : RainLive { override fun close() { leaves++ } } }
        val lesson = rainTestLesson()
        owner.update(false, true, lesson, open); owner.update(true, false, lesson, open); assertEquals(0, opens)
        owner.update(true, true, lesson, open); owner.update(true, true, lesson, open); assertEquals(1, opens)
        owner.update(true, false, lesson, open); assertEquals(1, leaves)
        owner.update(true, true, lesson, open); assertEquals(2, opens)
        owner.update(true, true, lesson.copy(id = "different"), open); assertEquals(2, leaves)
        owner.update(false, false, null, open); owner.stop(); assertEquals(3, leaves)
    }
    @Test fun demoSupportsQrListsTwoSeparateJoinWritesAndManualProblems() = runBlocking {
        val demo = DemoRainBackend(RainHost.WWW) { 100000 }
        val user = demo.user(); assertTrue(demo.poll(demo.qr())); assertEquals(2, demo.courses().size); assertEquals(1, demo.onLesson().size); assertTrue(demo.writes.isEmpty())
        val gate = RainGate(); val scan = RainAction.Scan(user, "https://www.yuketang.cn/demo/lesson")
        gate.preview(scan, 100000); assertTrue(demo.writes.isEmpty()); val scanned = gate.begin(100000) as RainAction.Scan; val id = demo.scan(scanned.user, scanned.url); gate.finish()
        assertEquals(listOf("SCAN"), demo.writes)
        gate.preview(RainAction.Join(user, id, "演示"), 100000); val join = gate.begin(100000) as RainAction.Join; val lesson = demo.join(join.user, join.lessonId); gate.finish()
        val deck = demo.presentation(lesson, "demo"); assertEquals(7, deck.slides.size); assertFalse(deck.slides.last().problem!!.supported)
        assertTrue(deck.slides.take(6).all { it.problem!!.supported }); assertTrue(demo.image(deck.slides.first().image).isNotEmpty())
        assertEquals(RainResult.SUCCESS, demo.answer(rainTestAnswer().copy(lesson = lesson))); assertEquals(RainResult.SUCCESS, demo.answer(rainTestAnswer(retry = true).copy(lesson = lesson)))
        assertEquals(RainResult.SUCCESS, demo.locate(RainAction.Location(lesson, XxtPosition(20.5, 110.5, 99999, 10f), demo.eligibility(lesson))))
        assertEquals(listOf("SCAN", "JOIN", "ANSWER", "RETRY", "LOCATION"), demo.writes)
    }
    @Test fun demoExposesFailuresForEveryReadAndWritePartWithoutNetwork() = runBlocking<Unit> {
        val demo = DemoRainBackend(RainHost.WWW) { 100000 }
        for (scenario in listOf(RainDemoFailure.PROFILE, RainDemoFailure.QR, RainDemoFailure.COURSES, RainDemoFailure.ON_LESSON, RainDemoFailure.SLIDES, RainDemoFailure.IMAGES)) {
            demo.failure = scenario
            val error = runCatching { when (scenario) { RainDemoFailure.PROFILE -> demo.user(); RainDemoFailure.QR -> demo.qr(); RainDemoFailure.COURSES -> demo.courses(); RainDemoFailure.ON_LESSON -> demo.onLesson(); RainDemoFailure.SLIDES -> demo.presentation(rainTestLesson(), "demo"); else -> demo.image("https://unused.example") } }.exceptionOrNull()
            assertTrue(error is RainFailure)
        }
        demo.failure = RainDemoFailure.POLL; assertFalse(demo.poll(RainQr("demo", "demo")))
        val user = RainUser("1001", "演示同学")
        demo.failure = RainDemoFailure.SCAN; assertEquals("REJECTED", (runCatching { demo.scan(user, "https://www.yuketang.cn/demo") }.exceptionOrNull() as RainFailure).kind)
        demo.failure = RainDemoFailure.JOIN; assertEquals("REJECTED", (runCatching { demo.join(user, "demo") }.exceptionOrNull() as RainFailure).kind)
        demo.failure = RainDemoFailure.ANSWER; assertEquals(RainResult.REJECTED, demo.answer(rainTestAnswer()))
        demo.failure = RainDemoFailure.RETRY; assertEquals(RainResult.REJECTED, demo.answer(rainTestAnswer(retry = true)))
        demo.failure = RainDemoFailure.LOCATION; assertEquals(RainResult.REJECTED, demo.locate(RainAction.Location(rainTestLesson(), XxtPosition(20.5, 110.5, 99999, 10f), RainEligibility(true, false, ""))))
        demo.failure = RainDemoFailure.UNKNOWN; assertEquals(RainResult.UNKNOWN, demo.answer(rainTestAnswer()))
    }
    @Test fun demoEmptyListsAndEmptyDeckAreNotFailures() = runBlocking {
        val demo = DemoRainBackend(RainHost.WWW); demo.failure = RainDemoFailure.EMPTY
        assertTrue(demo.courses().isEmpty()); assertTrue(demo.onLesson().isEmpty()); assertTrue(demo.presentation(rainTestLesson(), "demo").slides.isEmpty())
    }
    @Test fun demoLiveHasReadOnlyEventsAndCloseOnExitAndFailurePath() {
        val demo = DemoRainBackend(RainHost.WWW); val frames = mutableListOf<RainFrame>(); var ends = 0
        val live = demo.connect(rainTestLesson(), frames::add) { ends++ }
        assertEquals(2, frames.size); assertTrue(frames.first().events.any { it.problem.isNotBlank() }); assertTrue(demo.writes.isEmpty())
        live.close(); live.close(); assertEquals(1, demo.leaveCount)
        demo.failure = RainDemoFailure.LIVE; demo.connect(rainTestLesson(), frames::add) { ends++ }.close(); assertEquals(1, ends); assertEquals(2, demo.leaveCount)
    }
    @Test fun gallerySavesSequentiallyAndReportsOnlyCompletedImages() = runBlocking {
        val slides = rainPresentation("deck", rainFixture("presentation")).slides; val saved = mutableListOf<String>(); val progress = mutableListOf<Int>()
        rainExportSlides(slides, { saved.add(it.id) }, progress::add)
        assertEquals(listOf("s1", "s2"), saved); assertEquals(listOf(1, 2), progress)
        assertTrue(runCatching { rainExportSlides(emptyList(), {}, {}) }.isFailure)
    }
    @Test fun galleryFailureAndCancellationStopWithoutAutomaticRetries() = runBlocking {
        val slides = rainPresentation("deck", rainFixture("presentation")).slides; var attempts = 0; var completed = 0
        assertTrue(runCatching { rainExportSlides(slides + slides, { attempts++; if (attempts == 2) throw IllegalStateException("fixture gallery full") }, { completed = it }) }.isFailure)
        assertEquals(2, attempts); assertEquals(1, completed)
        attempts = 0
        val job = launch { rainExportSlides(slides, { attempts++; awaitCancellation() }, {}) }
        yield(); job.cancelAndJoin(); assertEquals(1, attempts)
    }
}
