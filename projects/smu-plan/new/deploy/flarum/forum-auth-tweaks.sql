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
('custom_less', '
.item-signUp { display: none !important; }

body,
.App {
  background: #f7f2e8;
  color: #16345c;
}

.Header-secondary {
  gap: 12px;
}

.Button {
  border-radius: 14px;
}

.Button--primary,
.Button--primary:hover,
.Button--primary:focus {
  background: #e8652b;
  border: 2px solid #16345c;
  color: #fff8f0;
  box-shadow: 4px 4px 0 #16345c;
}

.Button--link,
.Button--link:hover,
.Header-title a,
.Header-title a:hover,
.DiscussionListItem-title,
.DiscussionListItem-title:hover {
  color: #16345c;
}

.Hero,
.DiscussionListItem,
.Dropdown-menu,
.Modal-content,
.Post-body,
.PostStream-item,
.DiscussionHero,
.IndexPage .sideNav,
.Composer-content {
  border-radius: 18px;
}

.DiscussionListItem,
.Dropdown-menu,
.Modal-content,
.Composer-content,
.Post-body,
.DiscussionHero {
  border: 2px solid #16345c;
  box-shadow: 4px 4px 0 rgba(22, 52, 92, 0.12);
}

.Hero {
  background: linear-gradient(135deg, rgba(232, 101, 43, 0.14), rgba(255, 255, 255, 0.45));
}

.TagLabel,
.Badge {
  border-radius: 999px;
}
');
