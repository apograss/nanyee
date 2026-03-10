export interface OidcClaimUser {
  id: string;
  username: string;
  email: string | null;
}

export interface OidcEmailClaim {
  email: string;
  emailVerified: boolean;
  synthetic: boolean;
}

export function getOidcEmailClaim(user: OidcClaimUser): OidcEmailClaim {
  const email = user.email?.trim().toLowerCase();
  if (email) {
    return {
      email,
      emailVerified: true,
      synthetic: false,
    };
  }

  return {
    email: `oidc+${user.id}@users.nanyee.de`,
    emailVerified: false,
    synthetic: true,
  };
}
