import Header from "@/components/organisms/Header";
import Footer from "@/components/organisms/Footer";
import AuthProvider from "@/components/providers/AuthProvider";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <Header />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </AuthProvider>
  );
}
