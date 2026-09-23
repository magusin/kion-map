"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { deviceType, type DeviceDTO } from "@/lib/types";
import { deviceHref } from "@/lib/links";

type Person = { name: string; count: number; types: Record<string, number>; places: string[] };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Opérateurs (utilisateurs des appareils) et leurs postes. */
export default function PeopleView({ initialName, initialQ }: { initialName: string | null; initialQ: string }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [q, setQ] = useState(initialQ || initialName || "");
  const [selected, setSelected] = useState<string | null>(initialName);
  const [devices, setDevices] = useState<DeviceDTO[] | null>(null);

  useEffect(() => {
    api<Person[]>("/api/people").then(setPeople).catch(() => setPeople([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    api<DeviceDTO[]>(`/api/devices?user=${encodeURIComponent(selected)}`)
      .then((d) => alive && setDevices(d))
      .catch(() => alive && setDevices([]));
    window.history.replaceState(null, "", `/people?name=${encodeURIComponent(selected)}`);
    return () => {
      alive = false;
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (people ?? []).filter((p) => !s || p.name.toLowerCase().includes(s));
  }, [people, q]);

  const person = people?.find((p) => p.name.toLowerCase() === selected?.toLowerCase());

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:flex-row">
      <section className="w-full space-y-3 lg:w-80 lg:shrink-0">
        <h1 className="text-lg font-semibold">Opérateurs</h1>
        <input className="input" placeholder="Rechercher une personne…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="card max-h-[calc(100vh-13rem)] divide-y divide-slate-100 overflow-y-auto">
          {people === null && <p className="p-3 text-sm text-slate-400">Chargement…</p>}
          {people && filtered.length === 0 && <p className="p-3 text-sm text-slate-500">Aucun opérateur trouvé.</p>}
          {filtered.map((p) => (
            <button
              key={p.name}
              onClick={() => {
                setSelected(p.name);
                setDevices(null);
              }}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${p.name.toLowerCase() === selected?.toLowerCase() ? "bg-blue-50" : "hover:bg-slate-50"}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">{initials(p.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block truncate text-xs text-slate-500">{p.places.join(", ") || "Non placé"}</span>
              </span>
              <span className="badge bg-slate-100 text-slate-600">{p.count}</span>
            </button>
          ))}
        </div>
        {people && <p className="text-xs text-slate-500">{people.length} opérateur(s). La liste vient du champ « Utilisateur » des appareils.</p>}
      </section>

      <section className="min-w-0 flex-1">
        {!selected ? (
          <div className="card p-8 text-center text-slate-500">Sélectionnez un opérateur pour voir ses postes et leur emplacement.</div>
        ) : (
          <div className="space-y-3">
            <div className="card flex items-center gap-4 p-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">{initials(selected)}</span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">{person?.name ?? selected}</h2>
                <p className="text-sm text-slate-500">
                  {devices ? `${devices.length} appareil(s)` : "Chargement…"}
                  {person && Object.keys(person.types).length > 0 && (
                    <> · {Object.entries(person.types).map(([t, n]) => `${deviceType(t).icon} ${n}`).join("  ")}</>
                  )}
                </p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {devices?.map((d) => {
                const t = deviceType(d.type);
                return (
                  <div key={d.id} className="card overflow-hidden" style={{ borderTop: `3px solid ${t.color}` }}>
                    <div className="flex items-start gap-3 p-3">
                      <span className="text-2xl">{t.icon}</span>
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="font-semibold">{d.name}</div>
                        <div className="text-xs text-slate-500">{t.label}</div>
                        <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5">
                          <dt className="text-slate-500">IP</dt>
                          <dd className="font-mono text-xs leading-5">{d.ip ?? "—"}</dd>
                          <dt className="text-slate-500">MAC</dt>
                          <dd className="font-mono text-xs leading-5">{d.mac ?? "—"}</dd>
                          <dt className="text-slate-500">Localisation</dt>
                          <dd>{d.location ?? "—"}</dd>
                          <dt className="text-slate-500">Plan / zone</dt>
                          <dd>
                            {d.plan ? (
                              <>
                                {d.plan.name}
                                {d.zone && <span style={{ color: d.zone.color }}> · {d.zone.name}</span>}
                              </>
                            ) : (
                              <span className="text-amber-600">Non placé</span>
                            )}
                          </dd>
                          {d.description && (
                            <>
                              <dt className="text-slate-500">Description</dt>
                              <dd>{d.description}</dd>
                            </>
                          )}
                        </dl>
                      </div>
                    </div>
                    <div className="border-t border-slate-100 bg-slate-50 px-3 py-2">
                      <Link href={deviceHref(d)} className="btn btn-sm btn-primary">
                        📍 {d.planId ? "Voir sur le plan" : "Voir la fiche"}
                      </Link>
                    </div>
                  </div>
                );
              })}
              {devices?.length === 0 && <p className="text-sm text-slate-500">Aucun appareil pour cet opérateur.</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
