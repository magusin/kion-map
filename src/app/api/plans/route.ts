import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handle, readJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { planCreateSchema } from "@/lib/validation";

export const GET = handle(async () => {
  await requireApiUser();
  const plans = await prisma.plan.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      zones: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } },
      _count: { select: { zones: true, devices: true } } },
  });
  return NextResponse.json(plans);
});

export const POST = handle(async (req: Request) => {
  await requireApiUser("MODERATOR");
  const data = planCreateSchema.parse(await readJson(req));
  const plan = await prisma.plan.create({ data });
  return NextResponse.json(plan, { status: 201 });
});
