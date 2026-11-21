package de.nanyee.app

import android.app.Activity

internal fun previewUpdate(activity: Activity): AppRelease? = activity.intent.getStringExtra("preview_update")?.let(::parseAppRelease)
