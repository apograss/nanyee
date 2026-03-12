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

export const GUESTBOOK_NAV_LINK: NavLinkConfig = {
  href: "/guestbook",
  label: "留言板",
};

export const DEFAULT_NAV_LINKS: NavLinkConfig[] = [
  { href: "/", label: "首页" },
  { href: "/kb", label: "知识库" },
  FORUM_NAV_LINK,
  API_NAV_LINK,
  { href: "/tools", label: "工具" },
  { href: "/links", label: "链接" },
  GUESTBOOK_NAV_LINK,
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

  const nextLinks = [...normalized];

  if (!nextLinks.some((link) => link.href === API_NAV_LINK.href)) {
    const forumIndex = nextLinks.findIndex((link) => link.href === FORUM_NAV_LINK.href);
    const insertIndex = forumIndex >= 0 ? forumIndex + 1 : nextLinks.length;
    nextLinks.splice(insertIndex, 0, API_NAV_LINK);
  }

  if (!nextLinks.some((link) => link.href === GUESTBOOK_NAV_LINK.href)) {
    const linksIndex = nextLinks.findIndex((link) => link.href === "/links");
    const aboutIndex = nextLinks.findIndex((link) => link.href === "/about");
    const insertIndex = linksIndex >= 0
      ? linksIndex + 1
      : aboutIndex >= 0
        ? aboutIndex
        : nextLinks.length;
    nextLinks.splice(insertIndex, 0, GUESTBOOK_NAV_LINK);
  }

  return nextLinks;
}
