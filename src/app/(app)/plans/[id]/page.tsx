import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageUser } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { deviceInclude } from "@/lib/devices";
import { toDeviceDTO, toPlanDTO, toZoneDTO } from "@/lib/dto";
import PlanViewer from "@/components/plan-viewer";

export default async function PlanPage(props: PageProps<"/plans/[id]">) {
  const user = await requirePageUser();
  const { id } = await props.params;
  const { device } = await props.searchParams;
  const plan = await prisma.plan.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      zones: { orderBy: { name: "asc" } },
      devices: { include: deviceInclude, orderBy: { name: "asc" } },
    },
  });
  if (!plan) notFound();
  const plans = await prisma.plan.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <PlanViewer
      key={plan.id}
      plan={toPlanDTO(plan)}
      zones={plan.zones.map(toZoneDTO)}
      devices={plan.devices.map(toDeviceDTO)}
      plans={plans}
      canEdit={hasRole(user.role, "MODERATOR")}
      initialDeviceId={Number(device) || null}
    />
  );
}
