package de.nanyee.app

import java.net.URI
import java.net.URLDecoder
import java.net.URLEncoder
import org.junit.Assert.*
import org.junit.Test

class FeedbackTest {
    private fun build(subject: String, body: String) = feedbackMailto(subject, body) {
        URLEncoder.encode(it, "UTF-8").replace("+", "%20")
    }

    @Test fun feedbackKeepsTheRecipientAndUnicodeDeviceDetails() {
        val body = "Nanyee 1.0.0 (100)\nAndroid 15\n示例 Pixel 9\n\n"
        val uri = URI(build("Nanyee 反馈", body))
        assertEquals("mailto", uri.scheme)
        assertTrue(uri.isOpaque)
        assertEquals("contact@nanyee.de", uri.rawSchemeSpecificPart.substringBefore('?'))
        val parameters = uri.rawSchemeSpecificPart.substringAfter('?').split('&').associate {
            it.substringBefore('=') to URLDecoder.decode(it.substringAfter('='), "UTF-8")
        }
        assertEquals("Nanyee 反馈", parameters["subject"])
        assertEquals(body, parameters["body"])
    }

    @Test fun emptyFieldsStillKeepTheRecipient() {
        assertEquals("mailto:contact@nanyee.de?subject=&body=", build("", ""))
    }

    @Test fun queryAndFragmentCharactersCannotInjectRecipientsOrParameters() {
        val result = build("a&cc=other@example.invalid", "?#%\n&subject=other")
        assertEquals(1, result.count { it == '?' })
        assertEquals(1, result.count { it == '&' })
        assertFalse(result.contains('#'))
        assertFalse(result.contains('\n'))
        assertTrue(result.startsWith("mailto:contact@nanyee.de?subject="))
    }
}
