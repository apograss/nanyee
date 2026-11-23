package de.nanyee.app

internal fun clampSlidePan(value: Float, scale: Float, size: Int, drawn: Float = size.coerceAtLeast(0).toFloat()): Float {
    val limit = ((drawn * scale - size.coerceAtLeast(0)) / 2f).coerceAtLeast(0f)
    return value.coerceIn(-limit, limit)
}

internal fun fittedSlideSize(width: Int, height: Int, imageWidth: Int, imageHeight: Int): Pair<Float, Float> {
    if (width <= 0 || height <= 0 || imageWidth <= 0 || imageHeight <= 0) return 0f to 0f
    val fit = minOf(width.toFloat() / imageWidth, height.toFloat() / imageHeight)
    return imageWidth * fit to imageHeight * fit
}
