package de.nanyee.app

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class TimetableCacheTest {
    private class MemoryStorage : TimetableCacheStorage {
        var value: String? = null
        override fun read() = value
        override fun write(value: String?) { this.value = value }
    }

    private fun snapshot() = TimetableSnapshot("student", listOf(payload("code" to "202601", "label" to "2026-2027-1")), "202601", mapOf(
        "202601" to CachedTimetable(listOf(payload("name" to "人体解剖学", "start_node" to "1")), "2026-09-07T08:00:00Z", 20, "2026-09-07"),
        "202502" to CachedTimetable(emptyList(), "2026-02-23T08:00:00Z", 18)
    ))

    @Test fun cacheRoundTripRetainsMultipleSemestersAndEmptyTimetables() {
        val storage = MemoryStorage()
        val cache = TimetableCacheStore(storage)
        assertNull(cache.load())
        cache.save(snapshot())
        assertEquals(snapshot(), cache.load())
        cache.clear()
        assertNull(cache.load())
    }

    @Test fun cacheOnlySerializesTimetableFields() {
        val value = snapshot()
        val table = value.tables.getValue("202601")
        val unsafe = payload("name" to "示例", "password" to "never-persist", "academic_session_id" to "session-secret", "cookies" to "cookie-secret")
        val encoded = TimetableCacheCodec.encode(value.copy(semesters = listOf(unsafe), tables = value.tables + ("202601" to table.copy(courses = listOf(unsafe)))))
        assertFalse(encoded.contains("never-persist"))
        assertFalse(encoded.contains("session-secret"))
        assertFalse(encoded.contains("cookie-secret"))
        assertEquals("示例", TimetableCacheCodec.decode(encoded).tables.getValue("202601").courses.single().text("name"))
    }

    @Test fun corruptAndUnsupportedSnapshotsAreRejected() {
        listOf("", "not-json", "{}", TimetableCacheCodec.encode(snapshot().copy(version = 2)), TimetableCacheCodec.encode(snapshot().copy(tables = emptyMap()))).forEach { data ->
            assertTrue(runCatching { TimetableCacheCodec.decode(data) }.isFailure)
        }
    }

    @Test fun storageErrorsAreNotSilentlyReportedAsSaved() {
        val cache = TimetableCacheStore(object : TimetableCacheStorage {
            override fun read(): String? = throw IllegalStateException("unavailable")
            override fun write(value: String?) { throw IllegalStateException("unavailable") }
        })
        assertTrue(runCatching { cache.load() }.isFailure)
        assertTrue(runCatching { cache.save(snapshot()) }.isFailure)
    }
}
