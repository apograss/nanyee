package de.nanyee.app

import kotlinx.coroutines.runBlocking
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.util.concurrent.TimeUnit

class PlatformAccountLiveListingTest {
    @Test fun loginAndReadOwnAccountListsOnly() {
        val username = System.getenv("NANYEE_PLATFORM_USERNAME").orEmpty()
        val password = System.getenv("NANYEE_PLATFORM_PASSWORD").orEmpty()
        assumeTrue("Read-only platform listing requires NANYEE_PLATFORM_USERNAME and NANYEE_PLATFORM_PASSWORD", username.isNotBlank() && password.isNotBlank())
        val storage = object : PlatformCookieStorage {
            private var cookies = ""
            override fun read() = cookies
            override fun write(value: String) { cookies = value }
        }
        val jar = PlatformCookies(storage)
        val client = OkHttpClient.Builder().cookieJar(jar).retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).callTimeout(45, TimeUnit.SECONDS).build()
        val guard = object : Call.Factory {
            override fun newCall(request: Request): Call {
                val path = request.url.encodedPath.removePrefix("/api/v1")
                check(request.url.isHttps && request.url.host == "nanyee.de")
                check(request.method == "POST" && path == "/auth/login" || request.method == "GET" && path in setOf("/auth/me", "/credentials", "/jobs", "/notices"))
                return client.newCall(request)
            }
        }
        val api = PlatformApi(storage, guard)
        try {
            runBlocking {
                platformUser(api.call("POST", "/auth/login", payload("username" to username, "password" to password)))
                assertTrue(platformUser(api.call("GET", "/auth/me")).text("id").isNotBlank())
                val credentials = accountRows(api.call("GET", "/credentials"))
                val jobs = accountRows(api.call("GET", "/jobs"))
                val notices = accountRows(api.call("GET", "/notices"))
                println("Platform read-only listing: PASS; credentials=${credentials.size}; jobs=${jobs.size}; notices=${notices.size}")
            }
        } catch (_: Throwable) { throw AssertionError("Platform read-only listing failed; account and response details omitted") }
        finally { runBlocking { api.clearLocal() }; client.connectionPool.evictAll(); client.dispatcher.executorService.shutdown() }
    }
}
