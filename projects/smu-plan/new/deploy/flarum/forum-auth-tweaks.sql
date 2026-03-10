REPLACE INTO flarum_settings (`key`, `value`) VALUES
('allow_sign_up', '1'),
('fof-oauth.generic', '1'),
('fof-oauth.log-oauth-errors', '1'),
('fof-oauth.fullscreenPopup', '0'),
('fof-oauth.popupWidth', '580'),
('fof-oauth.popupHeight', '720'),
('fof-oauth.generic.authorization_endpoint', 'https://nanyee.de/api/oauth/authorize'),
('fof-oauth.generic.token_endpoint', 'http://nanyee.de/api/oauth/token'),
('fof-oauth.generic.user_information_endpoint', 'http://nanyee.de/api/oauth/userinfo'),
('custom_less', '.item-signUp { display: none !important; }');
