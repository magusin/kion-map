import { requirePageUser } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import DeviceList from "@/components/device-list";

export default async function DevicesPage(props: PageProps<"/devices">) {
  const user = await requirePageUser();
  const sp = await props.searchParams;
  const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const plans = await prisma.plan.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <DeviceList
      // Nouvelle recherche depuis la barre globale = nouvel état
      key={str(sp.q)}
      plans={plans}
      canEdit={hasRole(user.role, "MODERATOR")}
      initial={{ q: str(sp.q), type: str(sp.type), planId: str(sp.planId), unplaced: sp.unplaced === "1", id: Number(sp.id) || null }}
    />
  );
}
