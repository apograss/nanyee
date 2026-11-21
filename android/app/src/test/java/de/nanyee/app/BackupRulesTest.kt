package de.nanyee.app

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.junit.Assert.*
import org.junit.Test
import org.w3c.dom.Element

class BackupRulesTest {
    @Test fun cloudTransferAndLegacyBackupExcludeEveryStorageDomain() {
        val domains = setOf("root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref")
        for ((file, sections) in mapOf("backup_rules.xml" to listOf("full-backup-content"), "data_extraction_rules.xml" to listOf("cloud-backup", "device-transfer"))) {
            val document = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File("src/main/res/xml/$file"))
            for (name in sections) {
                val section = document.getElementsByTagName(name).item(0) as Element
                val exclusions = section.getElementsByTagName("exclude")
                val actual = (0 until exclusions.length).associate { index ->
                    val row = exclusions.item(index) as Element
                    row.getAttribute("domain") to row.getAttribute("path")
                }
                assertEquals(domains.associateWith { "." }, actual)
                assertEquals(0, section.getElementsByTagName("include").length)
            }
        }
    }
}
