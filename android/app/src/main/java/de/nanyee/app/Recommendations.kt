package de.nanyee.app

internal data class Recommendation(val title: String, val url: String, val icon: Int, val note: String = "")
internal data class RecommendationGroup(val title: String, val items: List<Recommendation>)

internal val recommendationGroups = listOf(
    RecommendationGroup("仙人指路", listOf(
        Recommendation("慧生活798app的去广告版本", "https://github.com/nocookies111/life-798", R.drawable.link_life_798),
        Recommendation("ocs网课助手", "https://docs.ocsjs.com/", R.drawable.link_ocs, "可解决智慧树与学习通"),
        Recommendation("雨课堂刷课助手", "https://greasyfork.org/zh-CN/scripts/590400-雨课堂刷课助手new", R.drawable.link_yuketang, "基于原版修改，自用可用"),
        Recommendation("一个蛮活跃的学长", "https://github.com/rep1ace", R.drawable.link_rep1ace, "很多脚本基于他的二开"),
    )),
    RecommendationGroup("同好站点", listOf(
        Recommendation("SMU 生祠", "https://smuer.cn/", R.drawable.link_smuer, "南医学生公众号与资料索引"),
        Recommendation("david03 的博客", "https://david03.top/", R.drawable.link_david03, "医学、代码与碎碎念"),
    )),
    RecommendationGroup("一些私货", listOf(
        Recommendation("看看我的主页！", "https://apograss.cn/", R.drawable.link_apograss, "联系方式都在这里"),
        Recommendation("看看我的博客！", "https://blog.apograss.cn/", R.drawable.link_blog_apograss, "也可以从主页跳转"),
    )),
)
