package de.nanyee.app

import org.junit.Assert.*
import org.junit.Test

class CabinDemoCopyTest {
    @Test fun demoCredentialConfirmationNeverClaimsUploadOrPersistence() {
        val message = cabinCredentialSavedMessage(true)
        assertTrue(message.contains("本次演示"))
        assertTrue(message.contains("模拟凭据"))
        assertTrue(message.contains("不会上传"))
        assertFalse(message.contains("已安全提交"))
        assertEquals("凭据已安全提交给 nanyee.de。", cabinCredentialSavedMessage(false))
    }
}
