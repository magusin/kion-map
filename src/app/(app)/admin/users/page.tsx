import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UserAdmin from "@/components/user-admin";

export default async function UsersPage() {
  const me = await requirePageUser("ADMIN");
  const users = await prisma.user.findMany({
    select: { id: true, username: true, displayName: true, role: true, createdAt: true },
    orderBy: { username: "asc" },
  });
  return <UserAdmin meId={me.id} initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))} />;
}
