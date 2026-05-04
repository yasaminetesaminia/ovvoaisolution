import { Sidebar } from "@/components/sidebar";
import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen">
      <Sidebar email={user.email ?? null} />
      <main className="flex-1 px-8 py-8 overflow-x-auto">{children}</main>
    </div>
  );
}
