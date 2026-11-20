package de.nanyee.app

import kotlinx.serialization.Serializable

internal suspend fun <T> xxtReadRecover(credentials: suspend () -> Pair<String, String>, login: suspend (String, String) -> Unit, expired: () -> Unit, action: suspend () -> T): T = try { action() } catch (e: XxtFailure) {
    if (e.kind != "SESSION") throw e
    val (account, password) = credentials()
    if (account.isBlank() || password.isBlank()) { expired(); throw e }
    login(account, password)
    action()
}

internal enum class XxtStage { EDIT, CONFIRM, CAPTCHA, WRITING, SUCCESS, REJECTED, UNKNOWN }
internal class XxtFlow {
    var stage = XxtStage.EDIT; private set
    var plan: XxtSignPlan? = null; private set
    var enc2 = ""; private set
    var validate = ""; private set
    fun preview(value: XxtSignPlan, now: Long) {
        check(stage !in setOf(XxtStage.WRITING, XxtStage.UNKNOWN, XxtStage.SUCCESS))
        xxtValidate(value, now)
        if (value != plan) { enc2 = ""; validate = "" }
        plan = value; stage = if (value.detail.captcha && value.detail.type != 2 && validate.isBlank()) XxtStage.CAPTCHA else XxtStage.CONFIRM
    }
    fun verified(token: String) { check(stage == XxtStage.CAPTCHA); require(token.isNotBlank()); validate = token; stage = XxtStage.CONFIRM }
    fun begin(now: Long): XxtSignPlan {
        check(stage == XxtStage.CONFIRM)
        val value = requireNotNull(plan); xxtValidate(value, now); stage = XxtStage.WRITING
        return value
    }
    fun finish(result: XxtSignResult) {
        check(stage == XxtStage.WRITING)
        stage = when (result) {
            XxtSignResult.Success -> XxtStage.SUCCESS
            XxtSignResult.Rejected -> XxtStage.REJECTED
            XxtSignResult.Unknown -> XxtStage.UNKNOWN
            is XxtSignResult.Captcha -> { enc2 = result.enc2; validate = ""; XxtStage.CAPTCHA }
        }
    }
    fun dismiss() { check(stage != XxtStage.WRITING); stage = XxtStage.EDIT; plan = null; validate = ""; enc2 = "" }
}
@Serializable internal data class XxtJournal(val demo: Boolean = false, val course: XxtCourse? = null, val activity: XxtActivity? = null, val detail: XxtSignDetail? = null, val code: String = "", val photo: String = "", val writePending: Boolean = false, val classroom: XxtClassDraft = XxtClassDraft(), val classroomResult: XxtClassResult? = null)

internal class DemoXxtBackend : XxtBackend {
    private val classroomDemo = XxtClassroomDemo()
    private val current = XxtUser("12345", "演示同学")
    override suspend fun login(account: String, password: String) = current
    override suspend fun sendSms(phone: String) { require(phone.matches(Regex("1[0-9]{10}"))) }
    override suspend fun loginSms(phone: String, code: String): XxtUser {
        require(phone.matches(Regex("1[0-9]{10}")))
        if (code != "123456") throw XxtFailure("LOGIN", "演示：验证码错误，请输入 123456。")
        return current
    }
    override suspend fun user() = current
    override suspend fun courses() = listOf(XxtCourse("demo", "demo-class", "demo-cpi", "学习通课堂体验", "演示老师"))
    override suspend fun activities(course: XxtCourse): List<XxtActivity> {
        val names = listOf("普通签到", "拍照签到", "签到码签到", "手势签到", "二维码签到", "位置签到", "人脸签到 · 不支持", "服务器拒绝", "结果未知", "手动拼图验证")
        return names.mapIndexed { index, name -> XxtActivity("demo-$index", name, "演示活动 · 不联网", 2, true, 1795046400000L, signType = listOf(0, 0, 5, 3, 2, 4, 4, 0, 0, 0)[index]) } + XxtActivity("demo-ended", "已结束签到", "不可提交", 2, false, 1794960000000L) + classroomDemo.activities()
    }
    override suspend fun detail(activity: XxtActivity) = XxtSignDetail(activity.signType, photo = activity.id == "demo-1", face = activity.id == "demo-6", captcha = activity.id == "demo-9", address = if (activity.signType == 4) "请在手机真实当前位置体验定位" else "", codeLength = if (activity.signType == 5) 4 else 0)
    override suspend fun qrLogin() = XxtQrLogin("demo", "demo", byteArrayOf())
    override suspend fun pollQr(qr: XxtQrLogin) = current
    override suspend fun sign(user: XxtUser, plan: XxtSignPlan, validate: String, enc2: String): XxtSignResult {
        require(user.uid == current.uid); xxtValidate(plan, System.currentTimeMillis())
        return when (plan.activity.id) { "demo-7" -> XxtSignResult.Rejected; "demo-8" -> XxtSignResult.Unknown; "demo-9" -> if (validate == "manual-demo") XxtSignResult.Success else XxtSignResult.Captcha(); else -> XxtSignResult.Success }
    }
    override suspend fun captcha(plan: XxtSignPlan) = XxtCaptcha("demo", "", System.currentTimeMillis(), byteArrayOf(), byteArrayOf())
    override suspend fun solveCaptcha(challenge: XxtCaptcha, x: Int, plan: XxtSignPlan): String {
        if (x !in 115..135) throw XxtFailure("CAPTCHA", "请手动将滑块移到图中的缺口。")
        return "manual-demo"
    }
    override suspend fun clear() = classroomDemo.clear()
    override suspend fun classroom(course: XxtCourse, activity: XxtActivity, user: XxtUser) = classroomDemo.page(activity)
    override suspend fun submitClassroom(submission: XxtClassSubmission): XxtClassResult {
        require(submission.user.uid == current.uid)
        return classroomDemo.submit(submission)
    }
    override suspend fun picked(activity: XxtActivity, uid: String): XxtPickStatus {
        require(uid == current.uid)
        return classroomDemo.picked(activity)
    }
}
