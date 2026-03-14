export const ARTICLE_FORMATS = ["html", "markdown", "interactive-html"] as const;

export type ArticleFormat = (typeof ARTICLE_FORMATS)[number];

export function isInteractiveHtmlFormat(
  format: string | null | undefined,
): format is "interactive-html" {
  return format === "interactive-html";
}

export function canUseInteractiveHtml(role: string | null | undefined) {
  return role === "admin";
}
