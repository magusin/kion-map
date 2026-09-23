import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePageUser } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { DEVICE_TYPES } from "@/lib/types";
import NewPlanButton from "@/components/new-plan-button";
import SearchBox from "@/components/search-box";

export default async function HomePage() {
  const user = await requirePageUser();
  const [plans, deviceCount, unplaced, byType] = await Promise.all([
    prisma.plan.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, updatedAt: true, _count: { select: { zones: true, devices: true } } },
    }),
    prisma.device.count(),
    prisma.device.count({ where: { OR: [{ planId: null }, { x: null }] } }),
    prisma.device.groupBy({ by: ["type"], _count: { _all: true } }),
  ]);
  const canEdit = hasRole(user.role, "MODERATOR");
  const typeCounts = DEVICE_TYPES.map((t) => ({ ...t, count: byType.find((b) => b.type === t.value)?._count._all ?? 0 })).filter((t) => t.count > 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <section className="card p-5">
        <h1 className="text-lg font-semibold">Où se trouve un appareil ?</h1>
        <p className="mb-3 text-sm text-slate-500">Recherchez un appareil (nom, IP, MAC, description, localisation) ou une personne pour voir ses postes.</p>
        <SearchBox />
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Plans" value={plans.length} />
        <Stat label="Zones" value={plans.reduce((n, p) => n + p._count.zones, 0)} />
        <Stat label="Appareils" value={deviceCount} href="/devices" />
        <Stat label="Non placés" value={unplaced} href="/devices?unplaced=1" warn={unplaced > 0} />
      </section>

      {typeCounts.length > 0 && (
        <section className="flex flex-wrap gap-2">
          {typeCounts.map((t) => (
            <Link key={t.value} href={`/devices?type=${t.value}`} className="badge gap-1 border border-slate-200 bg-white py-1 text-slate-700 hover:bg-slate-50">
              <span>{t.icon}</span> {t.label} <b>{t.count}</b>
            </Link>
          ))}
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Plans</h2>
          {canEdit && <NewPlanButton />}
        </div>
        {plans.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">
            Aucun plan pour l&apos;instant.{" "}
            {canEdit ? "Créez-en un ou importez un fichier Excel depuis la page Appareils." : "Un modérateur doit en créer un."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => (
              <Link key={p.id} href={`/plans/${p.id}`} className="card group p-4 transition hover:border-blue-400 hover:shadow">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold group-hover:text-blue-700">{p.name}</h3>
                  <span className="text-2xl">🏢</span>
                </div>
                {p.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.description}</p>}
                <div className="mt-3 flex gap-3 text-xs text-slate-500">
                  <span>{p._count.zones} zone(s)</span>
                  <span>{p._count.devices} appareil(s)</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, href, warn }: { label: string; value: number; href?: string; warn?: boolean }) {
  const content = (
    <>
      <div className={`text-2xl font-bold ${warn ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className="card p-4 hover:border-blue-400">
      {content}
    </Link>
  ) : (
    <div className="card p-4">{content}</div>
  );
}
