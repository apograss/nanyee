export interface NavLinkConfig {
  href: string;
  label: string;
  external?: boolean;
}

export const FORUM_NAV_LINK: NavLinkConfig = {
  href: "/bbs",
  label: "论坛",
};

export const API_NAV_LINK: NavLinkConfig = {
  href: "https://api.nanyee.de",
  label: "API",
  external: true,
};

export const DEFAULT_NAV_LINKS: NavLinkConfig[] = [
  { href: "/", label: "首页" },
  { href: "/kb", label: "知识库" },
  FORUM_NAV_LINK,
  API_NAV_LINK,
  { href: "/tools", label: "工具" },
  { href: "/links", label: "链接" },
  { href: "/about", label: "关于" },
];

function normalizeForumLink(link: NavLinkConfig): NavLinkConfig {
  if (link.href === "/bbs") {
    return { ...link, external: false };
  }

  if (link.href === "https://chat.nanyee.de") {
    return {
      href: "/bbs",
      label: link.label || "论坛",
      external: false,
    };
  }

  return link;
}

export function normalizeNavLinks(links: NavLinkConfig[]): NavLinkConfig[] {
  const normalized = links.map(normalizeForumLink);

  if (normalized.some((link) => link.href === API_NAV_LINK.href)) {
    return normalized;
  }

  const forumIndex = normalized.findIndex((link) => link.href === FORUM_NAV_LINK.href);
  const nextLinks = [...normalized];
  const insertIndex = forumIndex >= 0 ? forumIndex + 1 : nextLinks.length;
  nextLinks.splice(insertIndex, 0, API_NAV_LINK);
  return nextLinks;
}
