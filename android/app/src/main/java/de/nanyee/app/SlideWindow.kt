package de.nanyee.app

internal fun slideWindow(index: Int, count: Int): List<Int> =
    if (index !in 0 until count) emptyList() else (maxOf(0, index - 2)..minOf(count - 1, index + 2)).toList()
