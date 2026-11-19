package de.nanyee.app

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import android.os.SystemClock
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlin.coroutines.resume
import kotlin.math.*

internal suspend fun xxtCurrentPosition(context: Context): XxtPosition {
    check(context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) { "需要精确定位权限；不支持手动填写坐标。" }
    val manager = context.getSystemService(LocationManager::class.java)
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { manager.isProviderEnabled(it) }
    check(providers.isNotEmpty()) { "请打开系统定位服务。" }
    return withTimeout(25000) {
        suspendCancellableCoroutine { continuation ->
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    @Suppress("DEPRECATION") val mock = location.isFromMockProvider
                    if (mock || !location.hasAccuracy() || location.accuracy !in 0f..100f || (SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) !in 0..120000000000L) return
                    val (lat, lon) = xxtBd09(location.latitude, location.longitude)
                    if (continuation.isActive) { manager.removeUpdates(this); continuation.resume(XxtPosition(lat, lon, System.currentTimeMillis(), location.accuracy)) }
                }
                override fun onProviderEnabled(provider: String) = Unit
                override fun onProviderDisabled(provider: String) = Unit
                @Deprecated("Deprecated in Android") override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
            }
            continuation.invokeOnCancellation { manager.removeUpdates(listener) }
            try { providers.forEach { manager.requestLocationUpdates(it, 0, 0f, listener, Looper.getMainLooper()) } }
            catch (e: Exception) { manager.removeUpdates(listener); continuation.cancel(e) }
        }
    }
}

internal fun xxtBd09(latitude: Double, longitude: Double): Pair<Double, Double> {
    if (longitude !in 72.004..137.8347 || latitude !in 0.8293..55.8271) return latitude to longitude
    val x = longitude - 105; val y = latitude - 35
    var dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * sqrt(abs(x))
    dLat += (20 * sin(6 * x * PI) + 20 * sin(2 * x * PI)) * 2 / 3
    dLat += (20 * sin(y * PI) + 40 * sin(y / 3 * PI)) * 2 / 3
    dLat += (160 * sin(y / 12 * PI) + 320 * sin(y * PI / 30)) * 2 / 3
    var dLon = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * sqrt(abs(x))
    dLon += (20 * sin(6 * x * PI) + 20 * sin(2 * x * PI)) * 2 / 3
    dLon += (20 * sin(x * PI) + 40 * sin(x / 3 * PI)) * 2 / 3
    dLon += (150 * sin(x / 12 * PI) + 300 * sin(x / 30 * PI)) * 2 / 3
    val rad = latitude / 180 * PI; val magic = 1 - 0.00669342162296594323 * sin(rad).pow(2)
    val gcjLat = latitude + dLat * 180 / ((6378245 * (1 - 0.00669342162296594323)) / (magic * sqrt(magic)) * PI)
    val gcjLon = longitude + dLon * 180 / (6378245 / sqrt(magic) * cos(rad) * PI)
    val z = hypot(gcjLon, gcjLat) + 0.00002 * sin(gcjLat * PI * 3000 / 180)
    val theta = atan2(gcjLat, gcjLon) + 0.000003 * cos(gcjLon * PI * 3000 / 180)
    return z * sin(theta) + 0.006 to z * cos(theta) + 0.0065
}
internal fun xxtDistance(a: XxtPosition, latitude: Double, longitude: Double): Int {
    val p1 = Math.toRadians(a.latitude); val p2 = Math.toRadians(latitude)
    val h = sin((p2 - p1) / 2).pow(2) + cos(p1) * cos(p2) * sin(Math.toRadians(longitude - a.longitude) / 2).pow(2)
    return (6371000 * 2 * asin(sqrt(h.coerceIn(0.0, 1.0)))).roundToInt()
}
