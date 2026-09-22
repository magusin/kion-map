import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePageUser } from "@/lib/auth";
import { deviceInclude } from "@/lib/devices";
import { toDeviceDTO, toPlanDTO, toZoneDTO } from "@/lib/dto";
import PlanEditor from "@/components/plan-editor";

export default async function EditPlanPage(props: PageProps<"/plans/[id]/edit">) {
  await requirePageUser("MODERATOR");
  const { id } = await props.params;
  const plan = await prisma.plan.findUnique({
    where: { id: Number(id) || 0 },
    include: { zones: { orderBy: { name: "asc" } } },
  });
  if (!plan) notFound();
  // Appareils du plan + appareils sans plan (à placer).
  const devices = await prisma.device.findMany({
    where: { OR: [{ planId: plan.id }, { planId: null }] },
    include: deviceInclude,
    orderBy: { name: "asc" },
  });
  return <PlanEditor key={plan.id} plan={toPlanDTO(plan)} zones={plan.zones.map(toZoneDTO)} devices={devices.map(toDeviceDTO)} />;
}
