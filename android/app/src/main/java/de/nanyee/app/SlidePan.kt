package de.nanyee.app

internal fun clampSlidePan(value: Float, scale: Float, size: Int): Float {
    val limit = (scale - 1f).coerceAtLeast(0f) * size.coerceAtLeast(0) / 2f
    return value.coerceIn(-limit, limit)
}
