export interface DefaultOAuthClient {
  clientId: string;
  name: string;
  redirectUris: string[];
  grants: string[];
  scopes: string[];
  clientSecret: string | null;
}

export const DEFAULT_OAUTH_CLIENTS: DefaultOAuthClient[] = [
  {
    clientId: "cloudmail",
    name: "CloudMail 邮箱",
    redirectUris: ["https://mail.nanyee.de/api/auth/oidc/callback"],
    grants: ["authorization_code"],
    scopes: ["openid", "profile", "email"],
    clientSecret: null,
  },
  {
    clientId: "newapi",
    name: "API 服务",
    redirectUris: ["https://api.nanyee.de/oauth/oidc"],
    grants: ["authorization_code"],
    scopes: ["openid", "profile", "email"],
    clientSecret: "newapi-secret-change-me",
  },
  {
    clientId: "flarum-chat",
    name: "Flarum 论坛",
    redirectUris: ["https://chat.nanyee.de/auth/generic"],
    grants: ["authorization_code"],
    scopes: ["openid", "profile", "email"],
    clientSecret: "flarum-secret-change-me",
  },
];
