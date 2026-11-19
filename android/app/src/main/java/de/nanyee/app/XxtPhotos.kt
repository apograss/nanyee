package de.nanyee.app

import java.io.File

internal fun xxtDiscardPhoto(path: String, directory: File, pending: Boolean): String {
    if (pending) return path
    if (path.isNotBlank()) {
        val file = File(path)
        if (file.canonicalFile.parentFile == directory.canonicalFile &&
            (file.name.startsWith("xxt_photo_") || file.name.startsWith("xxt_demo_photo_")) && file.name.endsWith(".jpg")) {
            check(file.delete() || !file.exists()) { "无法删除本地签到照片，请重试。" }
        }
    }
    return ""
}
