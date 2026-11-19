package de.nanyee.app

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class JsonContractTest {
    @Test fun readsApiValuesWithoutLosingChineseText() {
        val value = Json.parseToJsonElement("""{"name":"人体解剖学","weekday":3,"courses":[{"name":"基础化学"}]}""").obj()
        assertEquals("人体解剖学", value.text("name"))
        assertEquals(3, value.number("weekday"))
        assertEquals("基础化学", value.items("courses").single().text("name"))
    }
    @Test fun emptyAndNullFieldsAreSafe() {
        val value = Json.parseToJsonElement("""{"name":null,"courses":[]}""").obj()
        assertEquals("", value.text("name"))
        assertEquals(0, value.number("weekday"))
        assertTrue(value.items("courses").isEmpty())
        assertTrue(JsonNull.obj().isEmpty())
    }
    @Test fun errorMetadataAndPayloadPreserveSpecialCharacters() {
        val value = payload("password" to "a\"b\\c", "account" to "123")
        assertEquals("a\"b\\c", Json.parseToJsonElement(value.toString()).obj().text("password"))
        val error = SchoolError(410, "INVALID_REQUEST", "会话已过期\n请求编号：abc")
        assertEquals(410, error.status)
        assertEquals("INVALID_REQUEST", error.code)
        assertTrue(error.message!!.contains("abc"))
    }
}
