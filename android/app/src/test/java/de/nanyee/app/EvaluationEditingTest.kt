package de.nanyee.app

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import kotlin.random.Random

class EvaluationEditingTest {
    private class Source : EvaluationSource {
        val submitted = mutableListOf<EvaluationPreview>()
        override suspend fun pending() = (1..2).map { evaluationReference.copy(hour = "hour-$it") }
        override suspend fun draft(reference: EvaluationReference) = evaluationDraft(evaluationFixture, reference)
        override suspend fun submit(preview: EvaluationPreview): Int {
            submitted.add(preview)
            return evaluationSubmission(preview).getValue("wtpf").toInt()
        }
    }

    @Test fun setterIsCourseAndQuestionScopedTotalsAndSubmissionMatchEditedPreview() = runBlocking {
        val source = Source(); val run = ManualEvaluationRun()
        run.prepare(source, source.pending())
        val first = run.preview.first(); val untouched = run.preview.last()
        val key = first.draft.reference.key
        run.setAnswer(key, "quality", "worst")
        run.setAnswer(key, "attendance", "yes")
        run.setAnswer(key, "comment", "建议：增加案例\n保留讨论时间 & \"提问\"")
        assertEquals(untouched, run.preview.last())
        val edited = run.preview.first()
        assertEquals(5, evaluationTotal(edited))
        val fields = evaluationSubmission(edited)
        assertEquals("5", fields["wtpf"])
        val answers = Json.parseToJsonElement(fields.getValue("dt")).jsonArray.map { it.jsonObject }
        assertEquals("★", answers[0].text("dtjg")); assertEquals("worst", answers[0].text("zbxmdm"))
        assertEquals("是", answers[1].text("dtjg")); assertEquals(0, answers[1].number("fz"))
        assertEquals(edited.selections["comment"], answers[2].text("dtjg")); assertEquals("", answers[2].text("zbxmdm"))
        val shown = run.preview.toList()
        assertTrue(source.submitted.isEmpty())
        run.submit(source)
        assertEquals(shown, source.submitted)
        assertTrue(runCatching { run.setAnswer(key, "quality", "excellent") }.exceptionOrNull() is IllegalStateException)
    }

    @Test fun setterRejectsUnknownKeysOptionsOversizedTextAndExpiredRunsWithoutMutation() = runBlocking {
        val source = Source(); val run = ManualEvaluationRun()
        assertTrue(runCatching { run.setAnswer("missing", "quality", "worst") }.isFailure)
        run.prepare(source, source.pending())
        val before = run.preview.toList(); val key = before.first().draft.reference.key
        listOf(Triple("missing", "quality", "worst"), Triple(key, "missing", "worst"), Triple(key, "quality", "missing"), Triple(key, "quality", ""), Triple(key, "comment", "x".repeat(2001)), Triple(key, "comment", "bad\u0000text")).forEach { (course, question, value) ->
            assertTrue(runCatching { run.setAnswer(course, question, value) }.exceptionOrNull() is IllegalArgumentException)
            assertEquals(before, run.preview)
        }
        run.setAnswer(key, "comment", "")
        assertEquals("", run.preview.first().selections["comment"])
        run.dismiss()
        assertTrue(runCatching { run.randomize(key) }.isFailure)
        assertTrue(runCatching { run.setAnswer(key, "attendance", "no") }.isFailure)
        run.prepare(source, source.pending()); run.markStale()
        assertTrue(runCatching { run.setAnswer(key, "quality", "worst") }.isFailure)
    }

    @Test fun rerandomizeChangesOnlyChosenCourseAndKeepsLegacyJudgementDefault() = runBlocking {
        val source = Source(); val run = ManualEvaluationRun()
        run.prepare(source, source.pending())
        val key = run.preview.first().draft.reference.key; val untouched = run.preview.last()
        run.setAnswer(key, "quality", "worst"); run.setAnswer(key, "attendance", "yes"); run.setAnswer(key, "comment", "手写意见")
        run.randomize(key, Random(42))
        assertEquals(untouched, run.preview.last())
        val value = run.preview.first()
        assertEquals(evaluationAnswers(value.draft, Random(42)), value.selections)
        assertNotEquals("worst", value.selections["quality"])
        assertEquals("no", value.selections["attendance"]); assertEquals("", value.selections["comment"])
        run.submit(source)
        assertTrue(runCatching { run.randomize(key) }.exceptionOrNull() is IllegalStateException)
    }

    @Test fun explicitZeroJudgementIsUnscoredButMissingInvalidAndRoundedZeroAreDistinct() {
        val original = evaluationDraft(evaluationFixture, evaluationReference)
        val judgement = original.questions.first { it.indicator == "attendance" }
        assertTrue(judgement.nonScoring)
        assertEquals("否 · 不计分", evaluationAnswerLabel(judgement, "no"))
        assertEquals("是 · 不计分", evaluationAnswerLabel(judgement, "yes"))
        assertEquals("no", evaluationAnswers(original)["attendance"])
        for ((attribute, origin) in listOf("" to EvaluationScoreOrigin.MISSING, "data-fz='invalid'" to EvaluationScoreOrigin.INVALID, "data-fz=''" to EvaluationScoreOrigin.INVALID, "data-fz='NaN'" to EvaluationScoreOrigin.INVALID, "data-fz='Infinity'" to EvaluationScoreOrigin.INVALID, "data-fz='0.1'" to EvaluationScoreOrigin.EXPLICIT)) {
            val draft = evaluationDraft(evaluationFixture.replace("data-fz='0'", attribute), evaluationReference)
            val question = draft.questions.first { it.indicator == "attendance" }
            assertFalse(question.nonScoring); assertTrue(question.options.all { it.scoreOrigin == origin && it.score == 0 })
            assertFalse(evaluationAnswerLabel(question, "no").contains("不计分"))
        }
        val scored = judgement.copy(options = listOf(EvaluationOption("yes", 5, "是"), EvaluationOption("no", 0, "否")))
        assertEquals("是 · 5 分", evaluationAnswerLabel(scored, "yes"))
        assertEquals("否 · 0 分", evaluationAnswerLabel(scored, "no"))
        assertFalse(judgement.copy(options = emptyList()).nonScoring)
    }

    @Test fun textPrefillLimitsEmptyAndUnscoredTotalsAreValidated() {
        val html = evaluationFixture.replace("<h3>建议</h3></div>", "<h3>建议</h3><textarea maxlength='12'>增加案例讨论</textarea></div>")
        val draft = evaluationDraft(html, evaluationReference)
        val question = draft.questions.last()
        assertEquals(12, question.textLimit)
        assertEquals("增加案例讨论", evaluationAnswers(draft)["comment"])
        assertTrue(runCatching { validateEvaluationAnswer(question, "x".repeat(13)) }.isFailure)
        validateEvaluationAnswer(question, "")
        val onlyText = draft.copy(questions = listOf(question))
        assertEquals(0, evaluationTotal(EvaluationPreview(onlyText, evaluationAnswers(onlyText))))
        assertTrue(runCatching { evaluationTotal(EvaluationPreview(draft, emptyMap())) }.isFailure)
        assertTrue(runCatching { evaluationTotal(EvaluationPreview(draft, evaluationAnswers(draft) + ("extra" to "yes"))) }.isFailure)
    }

    @Test fun demoOffersEditableStarJudgementAndPrefilledTextWithoutNetwork() = runBlocking {
        val demo = DemoEvaluationSource(pause = {})
        val run = ManualEvaluationRun(); run.prepare(demo, demo.pending().take(1))
        val value = run.preview.single(); val key = value.draft.reference.key
        assertEquals(listOf(5, 1, 3), value.draft.questions.map { it.type })
        assertTrue(value.selections.getValue("comment").isNotEmpty())
        assertEquals("no", value.selections["attendance"])
        run.setAnswer(key, "quality", "option-1"); run.setAnswer(key, "attendance", "yes")
        assertEquals(5, evaluationTotal(run.preview.single()))
        run.submit(demo)
        assertEquals(2, demo.pending().size)
    }
}
