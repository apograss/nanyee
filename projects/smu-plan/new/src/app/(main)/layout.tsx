import Header from "@/components/organisms/Header";
import Footer from "@/components/organisms/Footer";
import AnnouncementBar from "@/components/organisms/AnnouncementBar";
import AuthProvider from "@/components/providers/AuthProvider";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AnnouncementBar />
      <Header />
      <main style={{ flex: 1 }}>{children}</main>
      <Footer />
    </AuthProvider>
  );
}
