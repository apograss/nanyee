package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class AppUpdateTest {
    private val json = """{"versionCode":"101","versionName":"1.0.1","url":"https://nanyee.de/downloads/android/nanyee-1.0.1.apk","notes":"修复与优化","size":34000000,"extra":true}"""
    @Test fun parsingAcceptsExtraFieldsAndNumericStrings() {
        val release = parseAppRelease(json)!!
        assertEquals(101, release.versionCode); assertEquals("1.0.1", release.versionName)
        assertEquals("修复与优化", release.notes)
        assertEquals("", parseAppRelease(json.replace("\"notes\":\"修复与优化\",", ""))!!.notes)
    }
    @Test fun invalidAndEmptyManifestsAreIgnored() {
        listOf("", "[]", "null", "{}", "<html>404</html>", json.replace("101", "no"), json.replace("101", "0"), json.replace("101", "2147483648"), json.replace("1.0.1\"", "\""), json.replace("https://nanyee.de", "http://nanyee.de")).forEach { assertNull(it, parseAppRelease(it)) }
    }
    @Test fun downloadUrlsMustBeHttpsOnTheExactHost() {
        listOf("https://nanyee.de/a.apk", "https://NANYEE.DE:443/a.apk").forEach { assertTrue(validReleaseUrl(it)) }
        listOf("http://nanyee.de/a", "https://www.nanyee.de/a", "https://nanyee.de.evil.test/a", "https://nanyee.de@evil.test/a", "https://user@nanyee.de/a", "https://nanyee.de:8443/a", "//nanyee.de/a", "javascript:alert(1)", "file:///a", "https://nanyee.de\\@evil.test/a", "").forEach { assertFalse(it, validReleaseUrl(it)) }
    }
    @Test fun comparisonAndDismissalUseVersionCodesAndManualCheckIgnoresDismissal() {
        val release = parseAppRelease(json)!!
        assertTrue(offerUpdate(release, 100, 0)); assertFalse(offerUpdate(release, 101, 0)); assertFalse(offerUpdate(release, 102, 0))
        assertFalse(offerUpdate(release, 100, 101)); assertTrue(offerUpdate(release, 100, 101, manual = true))
        assertTrue(offerUpdate(release.copy(versionCode = 102), 100, 101))
    }
    @Test fun checksAreThrottledEvenAfterFailuresButManualChecksBypassTheInterval() {
        assertTrue(updateCheckDue(100, 0)); assertFalse(updateCheckDue(1000, 1000)); assertFalse(updateCheckDue(86_400_999, 1000))
        assertTrue(updateCheckDue(86_401_000, 1000)); assertTrue(updateCheckDue(1001, 1000, manual = true)); assertFalse(updateCheckDue(999, 1000))
    }
}
