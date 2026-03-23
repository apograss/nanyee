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
.App,
.App-content,
.App-body,
.IndexPage,
.DiscussionPage {
  background: #f7f2e8;
  color: #16345c;
}

.Header {
  background: rgba(255, 250, 237, 0.96);
  border-bottom: 2px solid #16345c;
  box-shadow: none;
}

.Header-title a,
.Header-title a:hover,
.DiscussionListItem-title,
.DiscussionListItem-title:hover,
.TagLinkButton,
.TagLinkButton:hover,
.Post-body a,
.Post-body a:hover {
  color: #16345c;
}

.Header-primary .Button,
.Header-secondary .Button,
.Button,
.Button:hover,
.Button:focus {
  border-radius: 14px;
}

.Button {
  border: 2px solid #16345c;
  box-shadow: 3px 3px 0 rgba(22, 52, 92, 0.14);
}

.Button--primary,
.Button--primary:hover,
.Button--primary:focus {
  background: #e8652b;
  border-color: #16345c;
  color: #fff8f0;
}

.Button--secondary,
.Button--secondary:hover,
.Button--secondary:focus,
.Button--flat,
.Button--flat:hover,
.Button--flat:focus {
  background: #fffaf0;
  color: #16345c;
  border-color: #16345c;
}

.Hero,
.DiscussionListItem,
.Dropdown-menu,
.Modal-content,
.Post-body,
.PostStream-item,
.DiscussionHero,
.IndexPage .sideNav,
.Composer-content,
.App-nav .sideNav,
.NotificationList,
.UserCard {
  border-radius: 18px;
}

.DiscussionListItem,
.Dropdown-menu,
.Modal-content,
.Composer-content,
.Post-body,
.DiscussionHero,
.App-nav .sideNav,
.NotificationList,
.UserCard {
  border: 2px solid #16345c;
  box-shadow: 4px 4px 0 rgba(22, 52, 92, 0.12);
  background: rgba(255, 250, 240, 0.92);
}

.DiscussionListItem {
  background: #fffaf0;
}

.Hero,
.DiscussionHero {
  background: linear-gradient(135deg, rgba(232, 101, 43, 0.16), rgba(255, 255, 255, 0.55));
}

.TagLabel,
.Badge,
.Notification-unread,
.Composer-title,
.App-titleControl .Button,
.IndexPage-results .Button {
  border-radius: 999px;
}

.TagLabel,
.Badge {
  background: rgba(232, 101, 43, 0.12);
  color: #16345c;
  border: 1px solid rgba(22, 52, 92, 0.16);
}

.Composer-content,
.TextEditor-editor,
.Post-body,
.Dropdown-menu,
.NotificationList {
  color: #16345c;
}

.Search-input,
.FormControl,
textarea,
input {
  background: #fffaf0;
  border-radius: 14px;
  border: 2px solid rgba(22, 52, 92, 0.18);
}

.Hero,
.Composer:not(.minimized) {
  border: 2px solid #16345c;
}
');
