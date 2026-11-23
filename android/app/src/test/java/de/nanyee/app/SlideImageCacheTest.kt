package de.nanyee.app

import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test

class SlideImageCacheTest {
    @Test fun selectingAPageStartsBothNeighboursBeforeCurrentPageFinishes() = runBlocking {
        val requests = mutableListOf<Int>()
        val pending = CompletableDeferred<String>()
        val cache = SlideImageCache<String>(this)
        cache.select(5, 20) { requests.add(it); pending.await() }
        yield()
        assertEquals(setOf(3, 4, 5, 6, 7), requests.toSet())
        assertNull(cache[5])
        cache.select(6, 20) { requests.add(it); pending.await() }
        yield()
        assertEquals(1, requests.count { it == 6 })
        assertTrue(8 in requests)
        pending.complete("decoded")
        yield()
        assertEquals("decoded", cache[6])
        assertEquals("decoded", cache[8])
        cache.clear()
    }

    @Test fun swipingBackReusesTheSameDecodedObjectAndKeepsABoundedCache() = runBlocking {
        var requests = 0
        val cache = SlideImageCache<Any>(this)
        val load: suspend (Int) -> Any = { requests++; Any() }
        cache.select(4, 30, load); yield()
        val decoded = cache[4]
        assertNotNull(decoded)
        cache.select(5, 30, load); yield()
        assertEquals(6, requests)
        cache.select(4, 30, load); yield()
        assertEquals(6, requests)
        assertSame(decoded, cache[4])
        for (page in 6..20) { cache.select(page, 30, load); yield() }
        assertEquals(7, (0 until 30).count { cache[it] != null })
        assertTrue((18..22).all { cache[it] != null })
        cache.clear()
    }

    @Test fun invalidPagesDoNotLoadAndFailuresCanBeRetriedWithoutBreakingNeighbours() = runBlocking {
        val errors = mutableListOf<Int>()
        var attempts = 0
        val cache = SlideImageCache<String>(this, failed = { page, _ -> errors.add(page) })
        cache.select(0, 0) { error("must not load") }; yield()
        cache.select(-1, 4) { error("must not load") }; yield()
        cache.select(0, 4) { if (it == 0 && attempts++ == 0) error("fixture failure") else "page-$it" }; yield()
        assertEquals(listOf(0), errors)
        assertNull(cache[0]); assertEquals("page-2", cache[2])
        cache.select(0, 4) { "retried" }; yield()
        assertEquals("retried", cache[0]); assertEquals("page-2", cache[2])
        cache.invalidate(0)
        assertNull(cache[0])
        cache.select(0, 4) { "reloaded" }; yield()
        assertEquals("reloaded", cache[0])
        cache.clear()
    }

    @Test fun changingDeckCancelsPendingDownloadsAndCannotRestoreOldImages() = runBlocking {
        val waiting = CompletableDeferred<String>()
        val cache = SlideImageCache<String>(this)
        cache.select(0, 10) { waiting.await() }; yield()
        cache.clear()
        cache.select(0, 1) { "new deck" }; yield()
        waiting.complete("old deck"); yield()
        assertEquals("new deck", cache[0])
        assertNull(cache[1]); assertNull(cache[2])
        cache.clear()
        assertNull(cache[0])
    }
}
