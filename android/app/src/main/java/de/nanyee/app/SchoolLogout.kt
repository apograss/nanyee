package de.nanyee.app

internal fun clearRememberedSchoolLogin(clearRemember: () -> Unit, clearCredentials: () -> Unit) {
    val remember = runCatching(clearRemember)
    val credentials = runCatching(clearCredentials)
    remember.getOrThrow()
    credentials.getOrThrow()
}
