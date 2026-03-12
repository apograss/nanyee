import type { Metadata } from "next";

import AboutPageClient from "./AboutPageClient";

export const metadata: Metadata = {
  title: "关于",
};

export default function AboutPage() {
  return <AboutPageClient />;
}
