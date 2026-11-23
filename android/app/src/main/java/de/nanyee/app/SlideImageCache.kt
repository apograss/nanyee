package de.nanyee.app

import androidx.compose.runtime.mutableStateMapOf
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.job
import kotlinx.coroutines.launch

internal class SlideImageCache<T>(
    private val scope: CoroutineScope,
    private val capacity: Int = 7,
    private val loaded: (Int, T) -> Unit = { _, _ -> },
    private val failed: (Int, Exception) -> Unit = { _, _ -> }
) {
    private val pages = mutableStateMapOf<Int, T>()
    private val recent = mutableListOf<Int>()
    private val jobs = mutableMapOf<Int, Job>()
    private var window = emptyList<Int>()
    private var generation = 0

    init { require(capacity >= 5) }
    operator fun get(index: Int): T? = pages[index]

    fun select(index: Int, count: Int, load: suspend (Int) -> T) {
        window = slideWindow(index, count)
        jobs.keys.toList().filter { it !in window }.forEach { jobs.remove(it)?.cancel() }
        if (index in pages) touch(index)
        val version = generation
        (listOf(index) + window).distinct().filter { it in window && it !in pages && it !in jobs }.forEach { page ->
            val job = scope.launch(start = CoroutineStart.LAZY) {
                try {
                    val value = load(page)
                    ensureActive()
                    if (version == generation) {
                        pages[page] = value
                        touch(page)
                        while (pages.size > capacity) {
                            val oldest = recent.first { it !in window }
                            recent.remove(oldest); pages.remove(oldest)
                        }
                        loaded(page, value)
                    }
                } catch (e: CancellationException) { throw e } catch (e: Exception) {
                    if (version == generation) failed(page, e)
                } finally {
                    if (jobs[page] === coroutineContext.job) jobs.remove(page)
                }
            }
            jobs[page] = job
            job.start()
        }
    }

    private fun touch(index: Int) { recent.remove(index); recent.add(index) }
    fun invalidate(index: Int) { jobs.remove(index)?.cancel(); pages.remove(index); recent.remove(index) }
    fun clear() {
        generation++
        jobs.values.toList().forEach { it.cancel() }
        jobs.clear(); pages.clear(); recent.clear(); window = emptyList()
    }
}
