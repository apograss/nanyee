import { marked } from "marked";

import { sanitizeContent } from "./content";

interface RenderArticleBodyInput {
  content: string;
  format: "html" | "markdown";
}

export async function renderArticleBody({
  content,
  format,
}: RenderArticleBodyInput): Promise<string> {
  if (format === "markdown") {
    return sanitizeContent(await marked(content));
  }

  return sanitizeContent(content);
}
