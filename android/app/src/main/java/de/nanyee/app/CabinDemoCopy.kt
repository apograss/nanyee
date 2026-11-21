package de.nanyee.app

internal fun cabinCredentialSavedMessage(demo: Boolean) = if (demo)
    "本次演示已添加模拟凭据，不会上传到 nanyee.de。"
else "凭据已安全提交给 nanyee.de。"
