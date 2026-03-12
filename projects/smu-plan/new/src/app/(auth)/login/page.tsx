import type { Metadata } from "next";

import LoginPageClient from "./LoginPageClient";

export const metadata: Metadata = {
  title: "登录",
};

export default function LoginPage() {
  return <LoginPageClient />;
}
