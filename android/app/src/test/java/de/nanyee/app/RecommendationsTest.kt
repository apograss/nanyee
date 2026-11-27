package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test
import java.net.URI

class RecommendationsTest {
    @Test fun catalogHasWebsiteOrderAndSafeLinks() {
        assertEquals(listOf("仙人指路", "同好站点", "一些私货"), recommendationGroups.map { it.title })
        assertEquals(listOf(4, 2, 2), recommendationGroups.map { it.items.size })
        val items = recommendationGroups.flatMap { it.items }
        assertEquals(8, items.map { it.url }.distinct().size)
        items.forEach {
            assertEquals("https", URI(it.url).scheme)
            assertFalse(URI(it.url).host.isNullOrBlank())
            assertTrue(it.title.isNotBlank())
            assertFalse(it.note.contains('\n'))
            assertTrue(it.note.length <= 24)
            assertNotEquals(0, it.icon)
        }
        assertEquals("联系方式都在这里", items[6].note)
    }
}
