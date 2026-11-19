package de.nanyee.app

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import okhttp3.*
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer
import okio.Timeout
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class CourseGrabTest {
    private val category = GrabCategory("12", "公共选修课选课")
    private val courses = (1..4).map { GrabCourse("task-$it", "医学伦理 $it", "教师") }
    private fun plan(attempts: Int = 15, primary: Int = 5, conflicts: Boolean = false) = GrabPlan(category, courses, attempts, primary, conflicts)
    private fun run(pauses: MutableList<Long> = mutableListOf()) = CourseGrabRun(pause = { pauses.add(it) }, jitter = { a, _ -> a })
    private class Fake(val answer: suspend (Int, Boolean) -> GrabReply) : CourseGrabSource {
        val calls = mutableListOf<Pair<String, Boolean>>()
        override suspend fun categories() = emptyList<GrabCategory>()
        override suspend fun courses(category: String, page: Int) = GrabPage(0, emptyList())
        override suspend fun clock() = 0L
        override suspend fun select(category: String, course: GrabCourse, conflict: Boolean): GrabReply {
            calls.add(course.code to conflict)
            return answer(calls.size, conflict)
        }
    }
    @Test fun pythonCategoryAndCourseFixturesIncludingCapacityFallback() {
        assertEquals(listOf(category), grabCategories("""<a data-href="/new/student/xsxk/xklx/12" lay-iframe="公共选修课选课">入口</a>"""))
        val html = """<div id="bb1" class="disabled" lay-tips="选课学期:2026-2027-1" lay-iframe="公共选修课" data-jzyl="0" data-href="/xsxk.html?xklxdm=01&mode=list&bp=/"><span class="title">公共选修课</span></div>"""
        assertEquals(listOf(GrabCategory("01", "公共选修课")), grabCategories(html))
        assertTrue(grabCategories("暂无开放类型").isEmpty())
        assertTrue(runCatching { grabCategories("统一认证登录 扫码登录") }.exceptionOrNull() is SchoolError)
        val fixture = """{"total":1,"rows":[{"kcrwdm":"task-1","kcmc":"医学伦理","teaxm":"教师","jxbrs":20,"pkrs":30,"xf":1.5,"sksj":"周一"}]}"""
        val parsed = grabCourses(Json.parseToJsonElement(fixture))
        assertEquals(1, parsed.total); assertEquals(20, parsed.courses.single().selected); assertEquals(30, parsed.courses.single().capacity)
        assertEquals(20, grabCourses(Json.parseToJsonElement(fixture.replace("jxbrs", "xkrs"))).courses.single().selected)
        assertTrue(grabCourses(Json.parseToJsonElement("""{"total":0,"rows":[]}""")).courses.isEmpty())
        assertTrue(runCatching { grabCourses(Json.parseToJsonElement("{}")) }.isFailure)
        assertTrue(runCatching { grabCourses(Json.parseToJsonElement("""{"rows":[{}]}""")) }.isFailure)
    }
    @Test fun requestFieldsHeadersAndValidation() {
        val read = grabRequest("12", page = 2)
        assertEquals("POST", read.method); assertTrue(read.url.toString().endsWith("/xklx/12/kxkc"))
        assertEquals("https://zhjw.smu.edu.cn/new/student/xsxk/xklx/12", read.header("Referer"))
        assertTrue(read.body!!.contentType().toString().startsWith("application/x-www-form-urlencoded"))
        assertEquals("page=2&rows=50&sort=kcrwdm&order=asc", Buffer().also { read.body!!.writeTo(it) }.readUtf8())
        for (confirmed in listOf(false, true)) {
            val request = grabRequest("12", course = courses.first(), conflict = confirmed)
            assertTrue(request.url.encodedPath.endsWith("/add"))
            val body = request.body as FormBody
            assertEquals(listOf("kcrwdm", "kcmc", "qz", "xxyqdm", "hlct"), (0 until body.size).map { body.name(it) })
            assertEquals(if (confirmed) "1" else "0", body.value(4))
        }
        assertTrue(runCatching { grabRequest("../add", page = 1) }.isFailure)
        assertTrue(runCatching { grabRequest("12", page = 21) }.isFailure)
        for (invalid in listOf(plan().copy(preferences = emptyList()), plan().copy(attempts = 121), plan().copy(primary = 16), plan().copy(scheduled = "25:00:00"), plan().copy(preferences = listOf(courses[0], courses[0]))))
            assertTrue(runCatching { invalid.validate() }.isFailure)
    }
    @Test fun responseClassificationsMatchPythonButLimitIsNotSuccess() {
        for ((json, expected) in listOf(
            """{"code":0,"message":"成功"}""" to GrabOutcome.ENROLLED,
            """{"code":1,"message":"您已经选了该门课程"}""" to GrabOutcome.ENROLLED,
            """{"code":1,"message":"超出选课要求门数(1.0门)"}""" to GrabOutcome.LIMIT,
            """{"code":1,"message":"与已选课程上课时间有冲突"}""" to GrabOutcome.CONFLICT,
            """{"code":-1,"message":"当前不是选课时间"}""" to GrabOutcome.NOT_OPEN,
            """{"code":-1,"message":"不在选课时间"}""" to GrabOutcome.NOT_OPEN,
            """{"code":1,"message":"课程已满"}""" to GrabOutcome.REJECTED,
            "<html>gateway</html>" to GrabOutcome.UNKNOWN, "{}" to GrabOutcome.UNKNOWN, "[]" to GrabOutcome.UNKNOWN
        )) assertEquals(expected, grabReply(json).outcome)
    }
    @Test fun preferenceCyclingAndExhaustionAreSequentialWithJitter() = runBlocking {
        val pauses = mutableListOf<Long>()
        val fake = Fake { _, _ -> GrabReply(GrabOutcome.REJECTED, "满") }
        val run = run(pauses); run.execute(fake, plan(attempts = 9, primary = 2))
        assertEquals(listOf(1,1,1,2,3,4,1,2,3).map { "task-$it" }, fake.calls.map { it.first })
        assertEquals(8, pauses.size); assertTrue(pauses.all { it in 100..300 }); assertEquals(9, run.attempt)
        assertTrue(run.outcome.contains("未选上")); assertFalse(run.active)
        val noBurst = Fake { _, _ -> GrabReply(GrabOutcome.REJECTED, "满") }
        run().execute(noBurst, plan(attempts = 4, primary = 0))
        assertEquals(courses.map { it.code }, noBurst.calls.map { it.first })
    }
    @Test fun enrolledLimitAndConflictEachStopCorrectly() = runBlocking {
        for ((reply, text) in listOf(GrabOutcome.ENROLLED to "选课成功", GrabOutcome.LIMIT to "已达门数上限")) {
            val fake = Fake { _, _ -> GrabReply(reply, "回复") }; val run = run(); run.execute(fake, plan())
            assertEquals(1, fake.calls.size); assertTrue(run.outcome.contains(text))
        }
        val disabled = Fake { _, _ -> GrabReply(GrabOutcome.CONFLICT, "冲突") }
        run().execute(disabled, plan(attempts = 2, primary = 1))
        assertEquals(listOf(false, false), disabled.calls.map { it.second })
        val allowed = Fake { _, conflict -> GrabReply(if (conflict) GrabOutcome.ENROLLED else GrabOutcome.CONFLICT, "回复") }
        run().execute(allowed, plan(conflicts = true))
        assertEquals(listOf(false, true), allowed.calls.map { it.second })
    }
    @Test fun notOpenDoesNotSpendAttemptsButStopsAt600AndResetsAfterOpening() = runBlocking {
        val pauses = mutableListOf<Long>()
        val closed = Fake { _, _ -> GrabReply(GrabOutcome.NOT_OPEN, "当前不是选课时间") }
        val run = run(pauses); run.execute(closed, plan(attempts = 1, primary = 1))
        assertEquals(600, closed.calls.size); assertEquals(0, run.attempt); assertEquals(599, pauses.size)
        assertTrue(pauses.all { it in 500..1000 }); assertTrue(run.outcome.contains("等待开放超时"))
        val opens = Fake { n, _ -> GrabReply(if (n < 4) GrabOutcome.NOT_OPEN else GrabOutcome.ENROLLED, "回复") }
        val second = run(); second.execute(opens, plan(attempts = 1, primary = 1))
        assertEquals(4, opens.calls.size); assertEquals(1, second.attempt); assertTrue(second.outcome.contains("成功"))
        val unknownThenClosed = Fake { n, _ -> GrabReply(if (n == 1) GrabOutcome.UNKNOWN else GrabOutcome.NOT_OPEN, "回复") }
        val third = run(); third.execute(unknownThenClosed, plan(attempts = 2, primary = 1))
        assertEquals(601, unknownThenClosed.calls.size); assertEquals("结果未知，请在教务系统确认", third.outcome)
    }
    @Test fun unknownIsStickyAtExhaustionWithNoExtraVerificationWrites() = runBlocking {
        val fake = Fake { n, _ -> if (n == 1) throw java.io.IOException("timeout") else GrabReply(GrabOutcome.REJECTED, "满") }
        val run = run(); run.execute(fake, plan(attempts = 3, primary = 1))
        assertEquals(3, fake.calls.size); assertEquals("结果未知，请在教务系统确认", run.outcome)
        val succeeds = Fake { n, _ -> GrabReply(if (n == 1) GrabOutcome.UNKNOWN else GrabOutcome.ENROLLED, "回复") }
        val second = run(); second.execute(succeeds, plan())
        assertEquals(2, succeeds.calls.size); assertTrue(second.outcome.contains("成功"))
        val expired = Fake { _, _ -> throw SchoolError(410, "SESSION_EXPIRED", "expired") }
        val third = run(); third.execute(expired, plan()); assertEquals(1, expired.calls.size); assertTrue(third.outcome.contains("会话已过期"))
    }
    @Test fun retryAfterBackoffDoesNotConsumeBudgetAndCanBeCancelled() = runBlocking {
        val pauses = mutableListOf<Long>()
        val fake = Fake { n, _ -> if (n == 1) throw GrabThrottle(7000) else GrabReply(GrabOutcome.ENROLLED, "成功") }
        val run = run(pauses); run.execute(fake, plan(attempts = 1, primary = 1))
        assertEquals(listOf(7000L), pauses); assertEquals(1, run.attempt); assertEquals(2, fake.calls.size)
        val entered = CompletableDeferred<Unit>()
        val waiting = CourseGrabRun(pause = { entered.complete(Unit); awaitCancellation() })
        val limited = Fake { _, _ -> throw GrabThrottle(60000) }
        val task = launch { waiting.execute(limited, plan()) }
        entered.await(); task.cancelAndJoin()
        assertEquals(1, limited.calls.size); assertEquals("已取消", waiting.outcome); assertFalse(waiting.active)
    }
    @Test fun cancelInFlightStopsImmediatelyAndRetainedViewModelKeepsRun() = runBlocking {
        val store = ViewModelStore()
        val provider = ViewModelProvider.create(store, ViewModelProvider.NewInstanceFactory())
        val state = provider["grab", CourseGrabState::class.java]
        val started = CompletableDeferred<Unit>()
        val fake = Fake { _, _ -> started.complete(Unit); awaitCancellation() }
        val task = launch { state.run.execute(fake, plan()) }
        started.await()
        assertSame(state, provider["grab", CourseGrabState::class.java]); assertTrue(state.run.active)
        task.cancelAndJoin()
        assertEquals(1, fake.calls.size); assertTrue(state.run.outcome.contains("结果未知")); assertFalse(state.run.active)
        store.clear()
    }
    @Test fun scheduledCancellationNeverSelects() = runBlocking {
        val entered = CompletableDeferred<Unit>()
        val now = Instant.parse("2030-01-01T00:00:00Z")
        val waiting = CourseGrabRun(pause = { entered.complete(Unit); awaitCancellation() }, now = { now })
        val fake = Fake { _, _ -> error("must not submit") }
        val task = launch { waiting.execute(fake, plan().copy(scheduled = "12:00:00")) }
        entered.await(); task.cancelAndJoin()
        assertTrue(fake.calls.isEmpty()); assertEquals("已取消", waiting.outcome)
    }
    @Test fun clockOffsetUsesMinimumRttAndScheduledTimeRollsToTomorrow() {
        assertEquals(90L, grabClockOffset(listOf(GrabClockSample(1000, 100, 1500), GrabClockSample(2000, 20, 2100))))
        assertTrue(runCatching { grabClockOffset(emptyList()) }.isFailure)
        val now = Instant.parse("2030-01-01T00:00:00Z")
        assertEquals(Instant.parse("2030-01-01T03:59:58.950Z"), grabStartAt("12:00:00", 1000, now))
        assertEquals(Instant.parse("2030-01-01T23:59:59.950Z"), grabStartAt("08:00:00", 0, now))
        assertEquals(7000L, grabRetryMillis("7", now)); assertEquals(60000L, grabRetryMillis("garbage", now))
        assertEquals(10000L, grabRetryMillis("Tue, 1 Jan 2030 00:00:10 GMT", now))
    }
    @Test fun demoScenariosAreNetworkFree() = runBlocking {
        for (scenario in GrabDemoScenario.entries) {
            val source = DemoCourseGrabSource(scenario)
            assertEquals(2, source.categories().size); assertEquals(6, source.courses("12", 1).courses.size)
            assertTrue(source.courses("12", 2).courses.isEmpty())
            val reply = source.select("12", courses[0], false)
            assertEquals(when (scenario) { GrabDemoScenario.SUCCESS, GrabDemoScenario.FULL -> GrabOutcome.REJECTED; GrabDemoScenario.NOT_OPEN -> GrabOutcome.NOT_OPEN; GrabDemoScenario.CONFLICT -> GrabOutcome.CONFLICT; GrabDemoScenario.LIMIT -> GrabOutcome.LIMIT; GrabDemoScenario.UNKNOWN -> GrabOutcome.UNKNOWN }, reply.outcome)
        }
    }
    @Test fun directListingAndClockUseOnlyDocumentedReadRequestsAndRejectStaleSession() = runBlocking {
        val requests = mutableListOf<Request>()
        val transport = Fixture { request ->
            requests.add(request)
            assertFalse(request.url.encodedPath.endsWith("/add"))
            val body = when {
                request.url.encodedPath.endsWith("/kxkc") -> """{"total":0,"rows":[]}"""
                request.url.encodedPath.endsWith("/xsxk/") -> """<a data-href="/new/student/xsxk/xklx/12" lay-iframe="公共选修课选课">入口</a>"""
                else -> "welcome"
            }
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(200).message("OK")
                .header("Date", "Tue, 1 Jan 2030 00:00:00 GMT").body(body.toResponseBody()).build()
        }
        val api = DirectSchoolApi(transport)
        DirectSchoolApi::class.java.getDeclaredField("session").apply { isAccessible = true }.set(api, "fixture")
        val source = api.courseGrab("fixture")
        assertEquals(listOf(category), source.categories())
        assertTrue(source.courses("12", 1).courses.isEmpty())
        source.clock()
        assertEquals(4, requests.count { it.url.encodedPath == "/new/welcome.page" })
        assertEquals(1, requests.count { it.url.encodedPath.endsWith("/kxkc") })
        api.clear()
        val before = requests.size
        assertTrue(runCatching { source.categories() }.exceptionOrNull() is SchoolError)
        assertEquals(before, requests.size)
    }
    @Test fun directRateLimitBecomesBackoffAndNoAdditionalRequestIsSentEarly() = runBlocking {
        var count = 0
        val api = DirectSchoolApi(Fixture { request ->
            count++
            Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(429).message("limited")
                .header("Retry-After", "120").body("limited".toResponseBody()).build()
        })
        DirectSchoolApi::class.java.getDeclaredField("session").apply { isAccessible = true }.set(api, "fixture")
        val source = api.courseGrab("fixture")
        val failure = runCatching { source.courses("12", 1) }.exceptionOrNull() as GrabThrottle
        assertTrue(failure.waitMillis in 110000..120000)
        assertTrue(runCatching { source.courses("12", 1) }.exceptionOrNull() is GrabThrottle)
        assertEquals(1, count)
    }
    @Test fun closedRoundRedirectFixtureIsDistinctFromAuthenticationFailure() = runBlocking {
        for (mode in listOf("closed", "login-page", "sso", "http-error", "empty")) {
            var diagnostic: GrabDiscoveryDiagnostics? = null
            val api = DirectSchoolApi(Fixture { request ->
                val path = request.url.encodedPath
                val builder = Response.Builder().request(request).protocol(Protocol.HTTP_1_1).message("fixture")
                val redirect = when {
                    path == "/new/student/xsxk/" && mode == "sso" -> "https://uis.smu.edu.cn/authserver/login?ticket=secret"
                    path == "/new/student/xsxk/" && mode != "empty" -> "/"
                    path == "/" -> "/new/welcome.page"
                    else -> null
                }
                val body = if (path == "/new/welcome.page" && request.url.query == null && mode == "login-page") "<title>登录</title><input type=password>" else "<title>教务管理系统</title>选课尚未开放"
                builder.code(if (mode == "http-error" && path == "/new/student/xsxk/") 503 else if (redirect != null) 302 else 200)
                    .apply { if (redirect != null) header("Location", redirect) }.body(body.toResponseBody()).build()
            })
            DirectSchoolApi::class.java.getDeclaredField("session").apply { isAccessible = true }.set(api, "fixture")
            val result = runCatching { api.courseGrab("fixture") { diagnostic = it }.categories() }
            assertNotNull(diagnostic)
            when (mode) {
                "closed" -> { assertTrue(result.exceptionOrNull() is GrabSelectionClosed); assertEquals(listOf("/new/student/xsxk/", "/", "/new/welcome.page"), diagnostic!!.paths) }
                "login-page", "sso" -> assertEquals(410, (result.exceptionOrNull() as SchoolError).status)
                "http-error" -> assertEquals(503, (result.exceptionOrNull() as SchoolError).status)
                else -> assertTrue(result.getOrThrow().isEmpty())
            }
        }
    }
    @Test fun diagnosticsNeverEmitAccountDataOrRawUrls() {
        val diagnostic = grabDiscoveryDiagnostics(200, listOf("/new/student/xsxk/", "/private/secret-account"), """<title>张三 2026123456 教务管理系统</title><header>李四 123456</header><p>张三 2026123456 当前不在选课时间 secret@example.com</p><a href="/xklx/12?ticket=secret">课程</a><div data-href="/xsxk.html?xklxdm=01">入口</div>""")
        assertEquals(1, diagnostic.pathLinks); assertEquals(1, diagnostic.queryLinks)
        assertTrue(diagnostic.notice.contains("当前不在选课时间")); assertTrue(diagnostic.notice.length <= 200)
        for (secret in listOf("张三", "李四", "2026123456", "123456", "secret", "example.com")) assertFalse(diagnostic.toString().contains(secret))
        assertEquals("", grabDiscoveryDiagnostics(null, emptyList(), "").notice)
    }
    @Test fun scheduledRunSurvivesLocalExpiryAndReacquiresBeforeEveryAttempt() = runBlocking {
        val state = CourseGrabState()
        state.onSessionChanged("old")
        var now = Instant.parse("2030-01-01T00:00:00Z")
        var expires = now.plusSeconds(1800)
        var acquisitions = 0
        var renewals = 0
        val fake = Fake { n, _ ->
            assertTrue(now < expires)
            if (n == 1) { expires = now; GrabReply(GrabOutcome.REJECTED, "满") } else GrabReply(GrabOutcome.ENROLLED, "成功")
        }
        val source = ReacquiringCourseGrabSource {
            acquisitions++
            if (now >= expires) { renewals++; expires = now.plusSeconds(1800) }
            fake
        }
        val waiting = CourseGrabRun(pause = { ms -> now = now.plusMillis(ms); state.onSessionChanged("") }, now = { now }, jitter = { a, _ -> a })
        waiting.execute(source, plan(attempts = 2, primary = 1).copy(scheduled = "08:31:00"))
        assertEquals(2, renewals); assertEquals(3, acquisitions); assertEquals(2, fake.calls.size)
        assertTrue(waiting.outcome.contains("成功"))
    }
    @Test fun sessionExpiryDoesNotClearRunningStateAndOwnerChangesAreExplicit() = runBlocking {
        val owner = GrabSessionOwner()
        val initial = owner.identity
        owner.login("account-a"); assertEquals(initial, owner.identity)
        owner.login("account-a"); assertEquals(initial, owner.identity)
        owner.login("account-b"); assertNotEquals(initial, owner.identity)
        val switched = owner.identity
        owner.logout(); assertNotEquals(switched, owner.identity)
        val state = CourseGrabState()
        state.onSessionChanged("old")
        val entered = CompletableDeferred<Unit>()
        val fake = Fake { _, _ -> entered.complete(Unit); awaitCancellation() }
        val task = launch { state.run.execute(fake, plan()) }
        entered.await()
        state.onSessionChanged(""); state.onSessionChanged("fresh")
        assertTrue(state.run.active); assertTrue(task.isActive)
        task.cancelAndJoin()
        assertTrue(state.run.outcome.contains("结果未知"))
    }
    @Test fun upstreamExpiryInvalidatesEveryOperationAndNextAccessReacquires() = runBlocking {
        for (status in listOf(401, 410, 503)) {
            var expired = 0
            val failing = object : CourseGrabSource {
                private fun fail(): Nothing = throw SchoolError(status, "fixture", "fixture")
                override suspend fun categories(): List<GrabCategory> = fail()
                override suspend fun courses(category: String, page: Int): GrabPage = fail()
                override suspend fun clock(): Long = fail()
                override suspend fun select(category: String, course: GrabCourse, conflict: Boolean): GrabReply = fail()
            }
            val guarded = ExpiringCourseGrabSource(failing) { expired++ }
            assertEquals(status, (runCatching { guarded.categories() }.exceptionOrNull() as SchoolError).status)
            assertEquals(status, (runCatching { guarded.courses("12", 1) }.exceptionOrNull() as SchoolError).status)
            assertEquals(status, (runCatching { guarded.clock() }.exceptionOrNull() as SchoolError).status)
            assertEquals(status, (runCatching { guarded.select("12", courses[0], false) }.exceptionOrNull() as SchoolError).status)
            assertEquals(if (status in setOf(401, 410)) 4 else 0, expired)
        }
        var valid = true
        var accesses = 0
        var logins = 0
        val fresh = Fake { _, _ -> GrabReply(GrabOutcome.ENROLLED, "成功") }
        val access = ReacquiringCourseGrabSource {
            accesses++
            if (!valid) { logins++; valid = true }
            if (accesses == 1) ExpiringCourseGrabSource(object : CourseGrabSource by fresh {
                override suspend fun categories(): List<GrabCategory> = throw SchoolError(410, "SESSION_EXPIRED", "fixture")
            }) { valid = false } else fresh
        }
        assertTrue(runCatching { access.categories() }.exceptionOrNull() is SchoolError)
        assertFalse(valid)
        assertTrue(access.categories().isEmpty()); assertEquals(1, logins)
        var closedExpired = false
        val closed = ExpiringCourseGrabSource(object : CourseGrabSource by fresh {
            override suspend fun categories(): List<GrabCategory> = throw GrabSelectionClosed()
        }) { closedExpired = true }
        assertTrue(runCatching { closed.categories() }.exceptionOrNull() is GrabSelectionClosed)
        assertFalse(closedExpired)
    }
    private class Fixture(val respond: (Request) -> Response) : Call.Factory {
        override fun newCall(request: Request): Call = object : Call {
            override fun request() = request
            override fun execute(): Response = error("enqueue only")
            override fun enqueue(callback: Callback) = callback.onResponse(this, respond(request))
            override fun cancel() {}
            override fun isCanceled() = false
            override fun isExecuted() = true
            override fun clone(): Call = newCall(request)
            override fun timeout() = Timeout.NONE
        }
    }
}
