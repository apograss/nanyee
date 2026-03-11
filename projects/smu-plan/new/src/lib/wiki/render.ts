import { marked } from "marked";
import slugify from "slugify";

import { sanitizeContent } from "./content";

interface RenderArticleBodyInput {
  content: string;
  format: "html" | "markdown";
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, "").trim();
}

function buildHeadingId(text: string): string {
  const normalized = slugify(text, {
    lower: true,
    strict: true,
    locale: "zh",
    trim: true,
  });

  if (normalized) {
    return normalized;
  }

  return (
    Array.from(text.trim())
      .map((char) => `u${char.codePointAt(0)?.toString(16) ?? ""}`)
      .join("-") || "section"
  );
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function enhanceMarkdownHtml(html: string): string {
  return html
    .replace(/<table>/g, '<div class="article-table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>")
    .replace(/<pre><code/g, '<pre class="article-code-block"><code');
}

function createMarkdownRenderer() {
  const renderer = new marked.Renderer();

  renderer.heading = function heading({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const id = buildHeadingId(stripHtmlTags(text));
    return `<h${depth} id="${escapeAttribute(id)}">${text}</h${depth}>`;
  };

  renderer.link = function link({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const attrs = [`href="${escapeAttribute(href)}"`];

    if (title) {
      attrs.push(`title="${escapeAttribute(title)}"`);
    }

    if (/^https?:\/\//i.test(href)) {
      attrs.push('target="_blank"', 'rel="noopener noreferrer"');
    }

    return `<a ${attrs.join(" ")}>${text}</a>`;
  };

  renderer.image = ({ href, title, text }) => {
    const attrs = [
      `src="${escapeAttribute(href)}"`,
      `alt="${escapeAttribute(text || "")}"`,
      'loading="lazy"',
      'decoding="async"',
    ];

    if (title) {
      attrs.push(`title="${escapeAttribute(title)}"`);
    }

    return `<img ${attrs.join(" ")} />`;
  };

  return renderer;
}

export async function renderArticleBody({
  content,
  format,
}: RenderArticleBodyInput): Promise<string> {
  if (format === "markdown") {
    const renderer = createMarkdownRenderer();
    const html = await marked.parse(content, {
      renderer,
      gfm: true,
      breaks: true,
    });

    return sanitizeContent(enhanceMarkdownHtml(html));
  }

  return sanitizeContent(content);
}
