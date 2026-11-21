package de.nanyee.app

import android.app.Application
import android.content.SharedPreferences
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModelStore
import kotlinx.coroutines.*
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.*
import org.junit.Test
import java.lang.reflect.Proxy
import kotlin.coroutines.CoroutineContext

class AccountStateTest {
    private class TestApplication : Application() {
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences =
            Proxy.newProxyInstance(SharedPreferences::class.java.classLoader, arrayOf(SharedPreferences::class.java)) { _, method, _ ->
                when (method.name) {
                    "getStringSet" -> emptySet<String>()
                    else -> error("Unexpected preference call: ${method.name}")
                }
            } as SharedPreferences
    }

    private fun state(saved: SavedStateHandle): AccountState {
        val unsafe = Class.forName("sun.misc.Unsafe")
        val singleton = unsafe.getDeclaredField("theUnsafe").apply { isAccessible = true }.get(null)
        val app = unsafe.getMethod("allocateInstance", Class::class.java).invoke(singleton, TestApplication::class.java) as Application
        val state = AccountState(app, saved)
        val scope = Class.forName("androidx.lifecycle.viewmodel.internal.CloseableCoroutineScope")
            .getConstructor(CoroutineContext::class.java).newInstance(Dispatchers.Unconfined + Job()) as AutoCloseable
        state.addCloseable("androidx.lifecycle.viewmodel.internal.ViewModelCoroutineScope.JOB_KEY", scope)
        return state
    }

    @Test fun overviewRestoreDoesNotSelectOrPersistDemoMode() = runBlocking<Unit> {
        for (explicitDemo in listOf(false, true)) {
            val saved = SavedStateHandle(if (explicitDemo) mapOf("accountDemo" to true) else emptyMap())
            val state = state(saved)
            val model = AccountModel(DemoAccountBackend(initiallySignedIn = true), AccountRecovery({ null }, { _, _ -> }))
            @Suppress("UNCHECKED_CAST")
            val models = AccountState::class.java.getDeclaredField("models").apply { isAccessible = true }.get(state) as MutableMap<Boolean, AccountModel>
            models[explicitDemo] = model
            repeat(3) {
                state.restoreOverview()
                val job = AccountState::class.java.getDeclaredField("work").apply { isAccessible = true }.get(state) as Job
                withTimeout(5000) { job.join() }
                assertEquals(explicitDemo, state.demo)
                assertEquals(if (explicitDemo) true else null, saved.get<Boolean>("accountDemo"))
                assertSame(model, state.model)
                assertNotNull(model.user)
            }
            ViewModelStore().apply { put("account", state); clear() }
        }
    }

    @Test fun schoolDemoOverviewNeverCallsThePlatformOrChangesItsSelection() = runBlocking<Unit> {
        for (explicitDemo in listOf(false, true)) {
            val saved = SavedStateHandle(if (explicitDemo) mapOf("accountDemo" to true) else emptyMap())
            val state = state(saved)
            var calls = 0
            val backend = object : PlatformBackend by DemoAccountBackend(initiallySignedIn = true) {
                override suspend fun call(method: String, path: String, body: JsonObject?, key: String?): JsonElement {
                    calls++
                    error("Demo overview must not call the platform")
                }
            }
            @Suppress("UNCHECKED_CAST")
            val models = AccountState::class.java.getDeclaredField("models").apply { isAccessible = true }.get(state) as MutableMap<Boolean, AccountModel>
            models[explicitDemo] = AccountModel(backend, AccountRecovery({ null }, { _, _ -> }))
            state.restoreOverview(schoolDemo = true)
            assertEquals(0, calls)
            assertNull(state.model)
            assertEquals(explicitDemo, state.demo)
            assertEquals(if (explicitDemo) true else null, saved.get<Boolean>("accountDemo"))
            state.restoreOverview(schoolDemo = false)
            val job = AccountState::class.java.getDeclaredField("work").apply { isAccessible = true }.get(state) as Job
            withTimeout(5000) { job.join() }
            assertEquals(1, calls)
            state.restoreOverview(schoolDemo = true)
            assertEquals(1, calls)
            assertEquals(explicitDemo, state.demo)
            assertEquals(if (explicitDemo) true else null, saved.get<Boolean>("accountDemo"))
            ViewModelStore().apply { put("account", state); clear() }
        }
    }

    @Test fun overviewOpenRestoresAnExistingSessionWithoutOpeningAccountDetails() = runBlocking<Unit> {
        for (scenario in listOf(AccountDemoFailure.NONE, AccountDemoFailure.SESSION, AccountDemoFailure.NETWORK, AccountDemoFailure.EMPTY)) {
            val state = state(SavedStateHandle())
            val backend = DemoAccountBackend(initiallySignedIn = true).apply { selectScenario(scenario) }
            val model = AccountModel(backend, AccountRecovery({ null }, { _, _ -> }))
            @Suppress("UNCHECKED_CAST")
            val models = AccountState::class.java.getDeclaredField("models").apply { isAccessible = true }.get(state) as MutableMap<Boolean, AccountModel>
            models[false] = model
            assertNull(state.model)
            state.restoreOverview()
            val job = AccountState::class.java.getDeclaredField("work").apply { isAccessible = true }.get(state) as Job
            withTimeout(5000) { job.join() }
            assertSame(model, state.model)
            assertEquals("", model.route)
            if (scenario == AccountDemoFailure.NONE || scenario == AccountDemoFailure.EMPTY) {
                assertEquals("demo", model.user?.text("username"))
                assertEquals("", model.error)
            } else {
                assertNull(model.user)
                assertTrue(model.error.isNotBlank())
            }
            assertEquals("", state.initializationError)
            ViewModelStore().apply { put("account", state); clear() }
        }
    }
}
