import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";

// Opérateurs = valeurs distinctes du champ « Utilisateur » des appareils.
export const GET = handle(async (req: Request) => {
  await requireApiUser();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const devices = await prisma.device.findMany({
    where: { assignedUser: q ? { contains: q, mode: "insensitive" } : { not: null } },
    select: { assignedUser: true, type: true, plan: { select: { name: true } }, zone: { select: { name: true } } },
  });
  // Regroupement sans tenir compte de la casse ni des espaces en trop.
  const people = new Map<string, { name: string; count: number; types: Record<string, number>; places: Set<string> }>();
  for (const d of devices) {
    const name = d.assignedUser!.trim();
    const key = name.toLowerCase();
    const p = people.get(key) ?? { name, count: 0, types: {}, places: new Set<string>() };
    p.count++;
    p.types[d.type] = (p.types[d.type] ?? 0) + 1;
    if (d.plan) p.places.add(d.zone ? `${d.plan.name} · ${d.zone.name}` : d.plan.name);
    people.set(key, p);
  }
  const list = [...people.values()]
    .map((p) => ({ name: p.name, count: p.count, types: p.types, places: [...p.places] }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
  return NextResponse.json(list);
});
