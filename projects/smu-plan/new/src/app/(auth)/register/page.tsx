import type { Metadata } from "next";

import RegisterPageClient from "./RegisterPageClient";

export const metadata: Metadata = {
  title: "注册",
};

export default function RegisterPage() {
  return <RegisterPageClient />;
}
