/**
 * Wiki permission helpers.
 */

interface AuthContext {
  userId: string;
  role: string;
}

interface ArticleLike {
  authorId: string;
  status: string;
  isLocked: boolean;
  lockedBy?: string | null;
}

/** Any logged-in user can view published articles; admins can view hidden ones. */
export function canViewArticle(article: ArticleLike, auth?: AuthContext | null): boolean {
  if (article.status === "published") return true;
  if (!auth) return false;
  if (auth.role === "admin") return true;
  return article.authorId === auth.userId;
}

/** Any logged-in user can edit unless locked (admins can always edit). */
export function canEditArticle(article: ArticleLike, auth: AuthContext): boolean {
  if (auth.role === "admin") return true;
  if (article.isLocked) return false;
  return true; // all logged-in users can edit wiki articles
}

/** Only admins can lock/unlock articles. */
export function canLockArticle(auth: AuthContext): boolean {
  return auth.role === "admin";
}

/** Only admins can revert to previous revisions. */
export function canRevertArticle(auth: AuthContext): boolean {
  return auth.role === "admin";
}
