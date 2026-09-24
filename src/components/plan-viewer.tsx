"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PlanCanvas from "./plan-canvas";
import DeviceDetails from "./device-details";
import DeviceForm from "./device-form";
import { moveDeviceHref } from "@/lib/links";
import { deviceType, type DeviceDTO, type PlanDTO, type Point, type ZoneDTO } from "@/lib/types";

type Props = {
  plan: PlanDTO;
  zones: ZoneDTO[];
  devices: DeviceDTO[];
  plans: { id: number; name: string }[];
  canEdit: boolean;
  initialDeviceId: number | null;
};

function matches(d: DeviceDTO, q: string) {
  if (!q) return true;
  const s = q.toLowerCase();
  return [d.name, d.ip, d.mac, d.assignedUser, d.location, d.description, deviceType(d.type).label].some((v) => v?.toLowerCase().includes(s));
}

export default function PlanViewer({ plan, zones, devices: initialDevices, plans, canEdit, initialDeviceId }: Props) {
  const router = useRouter();
  const [devices, setDevices] = useState(initialDevices);
  const [selectedId, setSelectedId] = useState<number | null>(initialDeviceId);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [labels, setLabels] = useState(true);
  const [editing, setEditing] = useState<DeviceDTO | null>(null);
  const [focus, setFocus] = useState<Point | null>(() => {
    const d = initialDevices.find((x) => x.id === initialDeviceId);
    return d && d.x !== null && d.y !== null ? [d.x, d.y] : null;
  });

  const selected = devices.find((d) => d.id === selectedId) ?? null;
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const filtered = useMemo(() => devices.filter((d) => matches(d, q.trim())), [devices, q]);
  const shown = useMemo(() => {
    const ids = new Set(filtered.map((d) => d.id));
    return devices.filter((d) => ids.has(d.id) && !(d.zoneId && hidden.has(d.zoneId)));
  }, [devices, filtered, hidden]);

  function select(d: DeviceDTO) {
    setSelectedId(d.id);
    setZoneId(null);
    if (d.x !== null && d.y !== null) setFocus([d.x, d.y]);
    window.history.replaceState(null, "", `/plans/${plan.id}?device=${d.id}`);
  }

  function toggleZone(id: number) {
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const unplaced = devices.filter((d) => d.x === null);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col md:flex-row">
      <aside className="flex max-h-[45vh] w-full shrink-0 flex-col border-b border-slate-200 bg-white md:max-h-none md:w-80 md:border-r md:border-b-0">
        <div className="space-y-2 border-b border-slate-200 p-3">
          <div className="flex items-center gap-2">
            <select
              className="input font-semibold"
              value={plan.id}
              onChange={(e) => router.push(`/plans/${e.target.value}`)}
              aria-label="Changer de plan"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {canEdit && (
              <Link href={`/plans/${plan.id}/edit`} className="btn shrink-0" title="Modifier le plan">
                ✏️
              </Link>
            )}
          </div>
          {plan.description && <p className="text-xs text-slate-500">{plan.description}</p>}
          <input className="input" placeholder="Filtrer les appareils de ce plan…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {zones.length > 0 && (
            <section className="border-b border-slate-200 p-3">
              <h3 className="label">Zones</h3>
              <ul className="space-y-0.5">
                {zones.map((z) => {
                  const count = devices.filter((d) => d.zoneId === z.id).length;
                  return (
                    <li key={z.id} className={`flex items-center gap-2 rounded px-1.5 py-1 text-sm ${z.id === zoneId ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <input type="checkbox" checked={!hidden.has(z.id)} onChange={() => toggleZone(z.id)} title="Afficher / masquer" />
                      <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: z.color }} />
                      <button
                        className="flex-1 truncate text-left"
                        onClick={() => {
                          setZoneId(z.id);
                          setSelectedId(null);
                        }}
                      >
                        {z.name}
                        {z.points.length < 3 && <span className="ml-1 text-xs text-amber-600">(non dessinée)</span>}
                      </button>
                      <span className="text-xs text-slate-400">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="p-3">
            <h3 className="label">
              Appareils ({filtered.length}
              {q ? ` / ${devices.length}` : ""})
            </h3>
            <ul className="space-y-0.5">
              {filtered.map((d) => {
                const t = deviceType(d.type);
                return (
                  <li key={d.id}>
                    <button
                      onClick={() => select(d)}
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm ${d.id === selectedId ? "bg-blue-100" : "hover:bg-slate-50"}`}
                    >
                      <span>{t.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{d.name}</span>
                        <span className="block truncate text-xs text-slate-500">{[d.ip, d.assignedUser].filter(Boolean).join(" · ")}</span>
                      </span>
                      {d.x === null && <span className="text-xs text-amber-600" title="Pas encore placé sur le plan">⚠</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {unplaced.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                {unplaced.length} appareil(s) rattaché(s) à ce plan mais pas encore positionné(s).
                {canEdit && (
                  <>
                    {" "}
                    <Link href={`/plans/${plan.id}/edit`} className="underline">
                      Les placer
                    </Link>
                  </>
                )}
              </p>
            )}
          </section>
        </div>
        <label className="flex items-center gap-2 border-t border-slate-200 px-3 py-2 text-xs text-slate-600">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Afficher les noms sur le plan
        </label>
      </aside>

      <div className="relative min-h-0 flex-1">
        <PlanCanvas
          plan={plan}
          shapes={plan.shapes}
          zones={zones}
          devices={shown}
          highlightDeviceId={selectedId}
          selectedZoneId={zoneId}
          hiddenZoneIds={hidden}
          showLabels={labels}
          focus={focus}
          onDeviceClick={select}
          onZoneClick={(z) => {
            setZoneId(z.id);
            setSelectedId(null);
          }}
          onBackgroundClick={() => {
            setSelectedId(null);
            setZoneId(null);
          }}
        />

        <div className="pointer-events-none absolute top-3 left-3 w-[min(22rem,calc(100%-1.5rem))] space-y-2">
          {selected && (
            <div className="pointer-events-auto">
              <DeviceDetails
                device={selected}
                onClose={() => setSelectedId(null)}
                onEdit={canEdit ? () => setEditing(selected) : undefined}
                moveHref={canEdit ? moveDeviceHref(selected) : undefined}
              />
            </div>
          )}
          {zone && (
            <div className="card pointer-events-auto p-3">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded" style={{ background: zone.color }} />
                <h3 className="flex-1 font-semibold">{zone.name}</h3>
                <button className="text-slate-400 hover:text-slate-700" onClick={() => setZoneId(null)} aria-label="Fermer">
                  ✕
                </button>
              </div>
              {zone.description && <p className="mt-1 text-sm text-slate-600">{zone.description}</p>}
              <ul className="mt-2 max-h-60 space-y-0.5 overflow-y-auto text-sm">
                {devices
                  .filter((d) => d.zoneId === zone.id)
                  .map((d) => (
                    <li key={d.id}>
                      <button className="flex w-full gap-2 rounded px-1 py-0.5 text-left hover:bg-slate-50" onClick={() => select(d)}>
                        <span>{deviceType(d.type).icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{d.name}</span>
                          {d.assignedUser && <span className="block truncate text-xs text-slate-500">👤 {d.assignedUser}</span>}
                        </span>
                        <span className="font-mono text-xs text-slate-500">{d.ip}</span>
                      </button>
                    </li>
                  ))}
                {!devices.some((d) => d.zoneId === zone.id) && <li className="text-slate-400">Aucun appareil dans cette zone.</li>}
              </ul>
            </div>
          )}
        </div>
      </div>

      {editing && (
        <DeviceForm
          device={editing}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            setEditing(null);
            if (d.planId === plan.id) setDevices((all) => all.map((x) => (x.id === d.id ? d : x)));
            else {
              setDevices((all) => all.filter((x) => x.id !== d.id));
              setSelectedId(null);
            }
          }}
          onDeleted={(id) => {
            setEditing(null);
            setSelectedId(null);
            setDevices((all) => all.filter((x) => x.id !== id));
          }}
        />
      )}
    </div>
  );
}
