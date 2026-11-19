package de.nanyee.app

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.os.Build
import android.provider.MediaStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import java.io.IOException

internal fun rainBitmap(bytes: ByteArray): Bitmap {
    require(bytes.size <= 12 * 1024 * 1024)
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    require(bounds.outWidth in 1..20000 && bounds.outHeight in 1..20000 && bounds.outWidth.toLong() * bounds.outHeight <= 100_000_000)
    var sample = 1
    while (bounds.outWidth.toLong() * bounds.outHeight / sample / sample > 4_000_000) sample *= 2
    return requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample }))
}
internal fun rainDemoBitmap(slide: RainSlide): Bitmap = Bitmap.createBitmap(1000, 700, Bitmap.Config.ARGB_8888).also { bitmap ->
    val canvas = Canvas(bitmap); canvas.drawColor(Color.rgb(18, 46, 76))
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = 42f }
    canvas.drawText("Nanyee · 雨课堂离线演示", 50f, 100f, paint)
    paint.textSize = 32f
    val lines = listOf("第 ${slide.index} 页", slide.problem?.body.orEmpty(), "题目需本人手动回答，无预填答案。", "图片可经确认后保存到本机相册。")
    lines.forEachIndexed { index, text -> canvas.drawText(text, 50f, 220f + 95f * index, paint) }
}
internal suspend fun rainSaveGallery(context: Context, bitmap: Bitmap, filename: String) = withContext(Dispatchers.IO) {
    val resolver = context.contentResolver
    val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, filename); put(MediaStore.Images.Media.MIME_TYPE, "image/png")
        if (Build.VERSION.SDK_INT >= 29) { put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Nanyee"); put(MediaStore.Images.Media.IS_PENDING, 1) }
    }
    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: throw IOException("Gallery unavailable")
    try {
        resolver.openOutputStream(uri)?.use { if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) throw IOException("Unable to save image") } ?: throw IOException("Gallery unavailable")
        if (Build.VERSION.SDK_INT >= 29) resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
    } catch (e: Exception) { withContext(NonCancellable) { resolver.delete(uri, null, null) }; throw e }
}
