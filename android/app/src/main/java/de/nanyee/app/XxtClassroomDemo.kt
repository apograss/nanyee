package de.nanyee.app

internal class XxtClassroomDemo {
    private val submitted = mutableSetOf<String>()
    private val replies = mutableMapOf<String, List<XxtReply>>()
    private var polls = 0
    fun clear() { submitted.clear(); replies.clear(); polls = 0 }
    fun activities(): List<XxtActivity> = listOf(43 to "投票", 14 to "问卷", 42 to "随堂练习", 5 to "主题讨论", 23 to "课堂评分", 11 to "选人监测").flatMap { (type, title) ->
        listOf(false, true).map { fail -> XxtActivity("class-$type-${if (fail) "fail" else "ok"}", "$title · ${if (fail) "失败" else "成功"}演示", "离线演示，不联网", type, true, 1795046400000L, topicId = if (type == 5) "demo-topic" else "") }
    } + XxtActivity("class-read", "未支持活动 · 只读演示", "仍可打开详情，不提供写入操作", 999, true, 1795046400000L)
    fun page(activity: XxtActivity): XxtClassPage {
        val choice = XxtQuestion("choice", 0, "你更喜欢哪种课堂形式？", true, listOf(XxtOption("A", "讨论"), XxtOption("B", "实践")))
        val multi = XxtQuestion("multi", 1, "选择想参加的环节（多选）", true, choice.options)
        val text = XxtQuestion("text", 4, "请手动写下你的想法", true)
        val page = when (activity.type) {
            43 -> XxtClassPage(activity.name, questions = listOf(choice), writable = true)
            14 -> XxtClassPage(activity.name, questions = listOf(choice, multi, text), writable = true)
            42 -> XxtClassPage(activity.name, "练习答案仅由你手动填写，不含参考答案。", questions = listOf(choice, multi, XxtQuestion("blank", 2, "为今天的课堂填两个关键词", true, blanks = 2), text), writable = true)
            5 -> XxtClassPage(activity.name, "分享你对今天课程的看法。", topicUuid = "demo-topic", replies = listOf(XxtReply("演示同学", "我喜欢动手实践。", "刚刚")) + replies[activity.id].orEmpty(), writable = true)
            23 -> XxtClassPage(activity.name, "请手动逐项评分。", norms = listOf(XxtNorm("内容", 60), XxtNorm("互动", 40)), writable = true)
            11 -> XxtClassPage(activity.name, "仅前台监测；成功场景在第二次轮询时选中本人，失败场景模拟读取失败。")
            else -> XxtClassPage(activity.name, activity.description, notice = "未知类型，只读详情。")
        }
        return if (activity.id in submitted) page.copy(submitted = true, writable = false, notice = "当前演示账号已提交。") else page
    }
    fun submit(value: XxtClassSubmission): XxtClassResult {
        xxtValidateClassroom(value, System.currentTimeMillis())
        if (value.activity.id.endsWith("fail")) return XxtClassResult.REJECTED
        if (value.activity.type == 5) replies[value.activity.id] = replies[value.activity.id].orEmpty() + XxtReply("演示同学", value.draft.text, "刚刚") else submitted.add(value.activity.id)
        return XxtClassResult.SUCCESS
    }
    fun picked(activity: XxtActivity): XxtPickStatus {
        require(activity.type == 11)
        if (activity.id.endsWith("fail")) throw XxtFailure("UPSTREAM", "演示：选人状态读取失败，请手动重新打开页面。")
        return XxtPickStatus(if (++polls >= 2) 1 else 0, true)
    }
}
