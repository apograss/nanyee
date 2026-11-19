package de.nanyee.app

import androidx.compose.runtime.*
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

internal class ManualEvaluationRun {
    var preview by mutableStateOf(emptyList<EvaluationPreview>()); private set
    var results by mutableStateOf(emptyList<String>()); private set
    var progress by mutableIntStateOf(0); private set
    var confirmed by mutableStateOf(false); private set
    suspend fun prepare(source: EvaluationSource, references: List<EvaluationReference>) {
        preview = emptyList(); results = emptyList(); progress = 0; confirmed = false
        require(references.isNotEmpty())
        val drafts = references.map { source.draft(it) }
        preview = drafts.map { EvaluationPreview(it, evaluationAnswers(it)) }
    }
    fun dismiss() { preview = emptyList() }
    fun reset() { dismiss(); results = emptyList(); progress = 0; confirmed = false }
    suspend fun submit(source: EvaluationSource) {
        check(!confirmed && preview.isNotEmpty())
        confirmed = true
        val values = preview
        preview = emptyList()
        for ((index, value) in values.withIndex()) {
            progress = index + 1
            try {
                source.submit(value)
                results = results + "${value.draft.reference.courseName}：提交成功"
            } catch (e: Exception) {
                if (e is CancellationException) {
                    results = results + "${value.draft.reference.courseName}：提交已中断，结果未知，请先到教务系统核验；已停止后续课程。"
                    throw e
                }
                results = results + "${value.draft.reference.courseName}：${(e as? SchoolError)?.message ?: "提交未确认，请到教务系统核验"}；已停止后续课程。"
                throw e
            }
        }
    }
}

internal class EvaluationState : ViewModel() {
    var busy by mutableStateOf(false); private set
    var error by mutableStateOf(""); private set
    var listed by mutableStateOf(false); private set
    var pending by mutableStateOf(emptyList<EvaluationReference>()); private set
    var selected by mutableStateOf(emptySet<String>())
    val run = ManualEvaluationRun()
    val demoSource = DemoEvaluationSource()
    private var source: EvaluationSource? = null
    private fun work(action: suspend () -> Unit) {
        if (busy) return
        busy = true; error = ""
        viewModelScope.launch {
            try { action() } catch (e: Exception) {
                if (e is CancellationException) throw e
                error = (e as? SchoolError)?.message ?: "评课未完成，可能尚未开放或表单无法读取；提交结果不确定时请先到教务系统核验。"
            } finally { busy = false }
        }
    }
    fun load(provider: suspend () -> EvaluationSource) = work {
        run.reset(); source = null; pending = emptyList(); selected = emptySet(); listed = false
        val next = provider()
        pending = next.pending(); source = next; selected = pending.map { it.key }.toSet(); listed = true
    }
    fun prepare() = work { run.prepare(checkNotNull(source), pending.filter { it.key in selected }) }
    fun confirm() = work { pending = emptyList(); selected = emptySet(); listed = false; run.submit(checkNotNull(source)) }
}

internal class DemoEvaluationSource : EvaluationSource {
    private val remaining = (1..3).map { EvaluationReference("teacher-$it", "hour-$it", "form-$it", "演示教师 $it", "演示课程 $it") }.toMutableList()
    override suspend fun pending() = remaining.toList()
    override suspend fun draft(reference: EvaluationReference) = EvaluationDraft(reference, emptyMap(), listOf(
        EvaluationQuestion(5, "quality", "教学质量", (1..5).map { EvaluationOption("option-$it", it * 5, "满意度 $it") }),
        EvaluationQuestion(1, "attendance", "是否迟到", listOf(EvaluationOption("yes", 0, "是"), EvaluationOption("no", 0, "否")))
    ))
    override suspend fun submit(preview: EvaluationPreview): Int {
        evaluationSubmission(preview)
        remaining.removeAll { it.key == preview.draft.reference.key }
        return preview.draft.questions.sumOf { q -> q.options.first { it.code == preview.selections[q.indicator] }.score }
    }
}
