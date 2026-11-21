package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class SchoolLogoutTest {
    @Test fun logoutRemovesRememberFlagAndAllSavedSchoolCredentials() {
        val preferences = mutableMapOf("remember" to true)
        val secure = mutableMapOf("account" to "demo", "password" to "fake")
        clearRememberedSchoolLogin({ preferences.remove("remember") }, { secure.clear() })
        assertFalse(preferences["remember"] ?: false)
        assertTrue(secure.isEmpty())
        clearRememberedSchoolLogin({ preferences.remove("remember") }, { secure.clear() })
        assertTrue(secure.isEmpty())
    }
    @Test fun bothDeletionsAreAttemptedEvenIfOneStorageFails() {
        var cleared = false
        assertTrue(runCatching { clearRememberedSchoolLogin({ error("storage") }, { cleared = true }) }.isFailure)
        assertTrue(cleared)
        var remembered = true
        assertTrue(runCatching { clearRememberedSchoolLogin({ remembered = false }, { error("keystore") }) }.isFailure)
        assertFalse(remembered)
    }
}
