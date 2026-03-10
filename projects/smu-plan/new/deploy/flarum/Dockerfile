FROM mondedie/flarum:latest

WORKDIR /flarum/app

COPY apply-auth-tweaks.php /tmp/apply-auth-tweaks.php

RUN composer require --no-interaction \
    fof/oauth \
    blt950/oauth-generic \
    flarum-lang/chinese-simplified \
 && php /tmp/apply-auth-tweaks.php
