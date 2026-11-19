package de.nanyee.app

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

class XuexitongLiveListingTest {
    @Test fun loginAndListOwnCoursesAndActivitiesOnly() {
        val account = System.getenv("XUEXITONG_LIVE_ACCOUNT").orEmpty()
        val password = System.getenv("XUEXITONG_LIVE_PASSWORD").orEmpty()
        assumeTrue("Read-only 学习通 listing requires both env vars", account.isNotBlank() && password.isNotBlank())
        val backend = XxtApi(MemoryXxtStorage(), readOnly = true)
        val listing: XxtListing = backend
        var stage = "login"
        try {
            runBlocking {
                listing.login(account, password)
                stage = "course listing"
                val courses = listing.courses()
                println("Xuexitong course count: ${courses.size}")
                stage = "activity listing"
                courses.forEachIndexed { index, course ->
                    val rows = listing.activities(course)
                    assertTrue(rows.all { it.id.isNotBlank() })
                    println("Xuexitong course index: ${index + 1}; activity count: ${rows.size}; ongoing: ${rows.count { it.ongoing }}")
                }
            }
        } catch (_: Throwable) { throw AssertionError("Read-only Xuexitong listing failed at $stage; upstream details omitted") }
        finally { runBlocking { backend.clear() } }
    }
}
