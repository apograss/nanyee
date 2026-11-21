package de.nanyee.app

import android.app.Application
import android.content.SharedPreferences
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModelStore
import kotlinx.coroutines.*
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

    @Test fun overviewOpenRestoresAnExistingSessionWithoutOpeningAccountDetails() = runBlocking<Unit> {
        for (scenario in listOf(AccountDemoFailure.NONE, AccountDemoFailure.SESSION, AccountDemoFailure.NETWORK, AccountDemoFailure.EMPTY)) {
            val unsafe = Class.forName("sun.misc.Unsafe")
            val singleton = unsafe.getDeclaredField("theUnsafe").apply { isAccessible = true }.get(null)
            val app = unsafe.getMethod("allocateInstance", Class::class.java).invoke(singleton, TestApplication::class.java) as Application
            val state = AccountState(app, SavedStateHandle())
            val scope = Class.forName("androidx.lifecycle.viewmodel.internal.CloseableCoroutineScope")
                .getConstructor(CoroutineContext::class.java).newInstance(Dispatchers.Unconfined + Job()) as AutoCloseable
            state.addCloseable("androidx.lifecycle.viewmodel.internal.ViewModelCoroutineScope.JOB_KEY", scope)
            val backend = DemoAccountBackend(initiallySignedIn = true).apply { selectScenario(scenario) }
            val model = AccountModel(backend, AccountRecovery({ null }, { _, _ -> }))
            @Suppress("UNCHECKED_CAST")
            val models = AccountState::class.java.getDeclaredField("models").apply { isAccessible = true }.get(state) as MutableMap<Boolean, AccountModel>
            models[false] = model
            assertNull(state.model)
            state.open()
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
