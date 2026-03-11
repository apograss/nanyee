/**
 * Content helpers: sanitize HTML on write, markdown→html conversion.
 */

import sanitizeHtml from "sanitize-html";

export const WIKI_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "strong", "em", "u", "s", "del", "mark",
    "blockquote", "pre", "code",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "th", "td",
    "a", "img",
    "div", "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading", "decoding", "title"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    code: ["class"],
    pre: ["class"],
    table: ["class"],
    h1: ["id"],
    h2: ["id"],
    h3: ["id"],
    h4: ["id"],
    h5: ["id"],
    h6: ["id"],
    span: ["style"],
    div: ["style", "class"],
    p: ["style"],
  },
  allowedStyles: {
    "*": {
      "text-align": [/^(left|center|right|justify)$/],
    },
  },
  allowedSchemes: ["http", "https", "mailto"],
};

/** Sanitize HTML content to prevent XSS. Call on every write. */
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, WIKI_SANITIZE_OPTIONS);
}
