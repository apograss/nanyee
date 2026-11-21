package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class AppLicensesTest {
    private fun asset(name: String) = javaClass.classLoader!!.getResourceAsStream(name)!!.bufferedReader().use { it.readText() }

    @Test fun bundledNoticesIncludeTheFullGplAndUpstreamAttribution() {
        val license = asset("LICENSE")
        assertTrue(license.contains("GNU GENERAL PUBLIC LICENSE"))
        assertTrue(license.contains("END OF TERMS AND CONDITIONS"))
        val notice = asset("NOTICE")
        assertTrue(notice.contains("AneryCoft"))
        assertTrue(notice.contains("GPL-3.0"))
        assertEquals(6, Regex("modified 2026-11").findAll(notice).count())
        assertTrue(notice.contains("https://github.com/apograss/nanyee"))
    }

    @Test fun thirdPartyNoticesIncludeActualRuntimeDependenciesAndTheirLicenseTexts() {
        val notice = asset("THIRD_PARTY_NOTICES.txt")
        listOf("ONNX Runtime Android 1.23.2", "OkHttp 4.12.0", "Kotlin", "AndroidX", "jsoup", "ZXing", "MIT License", "Copyright (c) Microsoft Corporation", "Apache License", "THIRD PARTY SOFTWARE NOTICES AND INFORMATION").forEach {
            assertTrue(it, notice.contains(it))
        }
    }
}
