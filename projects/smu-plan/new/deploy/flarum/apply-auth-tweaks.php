<?php

declare(strict_types=1);

$replacements = [
    '/flarum/app/vendor/flarum/core/src/Forum/Auth/ResponseFactory.php' => [
        '<script>window.close(); window.opener.app.authenticationComplete(%s);</script>'
            => '<script data-cfasync="false">window.close(); window.opener.app.authenticationComplete(%s);</script>',
    ],
    '/flarum/app/vendor/fof/extend/src/Controllers/AbstractOAuthController.php' => [
        '<script>window.close(); window.opener.app.linkingComplete();</script>'
            => '<script data-cfasync="false">window.close(); window.opener.app.linkingComplete();</script>',
    ],
    '/flarum/app/vendor/fof/oauth/src/Controllers/TwitterAuthController.php' => [
        '<script>window.close(); window.opener.app.linkingComplete();</script>'
            => '<script data-cfasync="false">window.close(); window.opener.app.linkingComplete();</script>',
    ],
    '/flarum/app/vendor/flarum-lang/chinese-simplified/locale/fof-oauth.yml' => [
        "with_button: '{provider} 账号登录'"
            => "with_button: '{provider} 登录'",
    ],
    '/flarum/app/vendor/flarum-lang/chinese-simplified/locale/blt950-oauth-generic.yml' => [
        'generic: 自定义' => 'generic: OAuth',
    ],
    '/flarum/app/vendor/flarum-lang/chinese-simplified/locale/core.yml' => [
        "sign_up_text: '还没有帐户？ <a>立即注册</a>'"
            => "sign_up_text: '首次使用请直接点击上方 OAuth 登录，系统会自动创建账号。'",
    ],
    '/flarum/app/vendor/blt950/oauth-generic/locale/en.yml' => [
        'generic: Generic' => 'generic: OAuth',
    ],
];

foreach ($replacements as $path => $pairs) {
    if (!file_exists($path)) {
        fwrite(STDERR, "Patch target not found: {$path}\n");
        exit(1);
    }

    $content = file_get_contents($path);
    if ($content === false) {
        fwrite(STDERR, "Failed to read patch target: {$path}\n");
        exit(1);
    }

    foreach ($pairs as $search => $replace) {
        if (!str_contains($content, $search)) {
            fwrite(STDERR, "Patch marker missing in {$path}: {$search}\n");
            exit(1);
        }

        $content = str_replace($search, $replace, $content);
    }

    file_put_contents($path, $content);
}

echo "Flarum auth tweaks applied.\n";
