import { requirePageUser } from "@/lib/auth";
import NavBar from "@/components/nav-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <>
      <NavBar user={user} />
      <main className="flex flex-1 flex-col">{children}</main>
    </>
  );
}
