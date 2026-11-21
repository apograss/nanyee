package de.nanyee.app

internal fun feedbackMailto(subject: String, body: String, encode: (String) -> String): String =
    "mailto:contact@nanyee.de?subject=${encode(subject)}&body=${encode(body)}"
