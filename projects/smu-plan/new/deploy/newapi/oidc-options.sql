UPDATE options
SET value = 'http://nanyee.de/api/oauth/token'
WHERE key = 'oidc.token_endpoint';

UPDATE options
SET value = 'http://nanyee.de/api/oauth/userinfo'
WHERE key = 'oidc.user_info_endpoint';

SELECT key, value
FROM options
WHERE key LIKE 'oidc.%'
ORDER BY key;
