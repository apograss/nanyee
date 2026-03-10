export interface NavLinkConfig {
  href: string;
  label: string;
  external?: boolean;
}

export const API_NAV_LINK: NavLinkConfig = {
  href: "https://api.nanyee.de",
  label: "API",
  external: true,
};

export const DEFAULT_NAV_LINKS: NavLinkConfig[] = [
  { href: "/", label: "首页" },
  { href: "/kb", label: "知识库" },
  { href: "https://chat.nanyee.de", label: "论坛", external: true },
  API_NAV_LINK,
  { href: "/tools", label: "工具" },
  { href: "/links", label: "链接" },
  { href: "/about", label: "关于" },
];

export function normalizeNavLinks(links: NavLinkConfig[]): NavLinkConfig[] {
  if (links.some((link) => link.href === API_NAV_LINK.href)) {
    return links;
  }

  const forumIndex = links.findIndex(
    (link) => link.href === "https://chat.nanyee.de",
  );
  const nextLinks = [...links];
  const insertIndex = forumIndex >= 0 ? forumIndex + 1 : nextLinks.length;
  nextLinks.splice(insertIndex, 0, API_NAV_LINK);
  return nextLinks;
}
