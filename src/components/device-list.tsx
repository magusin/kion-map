"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client";
import { DEVICE_TYPES, deviceType, type DeviceDTO } from "@/lib/types";
import DeviceDetails from "./device-details";
import DeviceForm from "./device-form";
import ImportModal from "./import-modal";
import { moveDeviceHref } from "@/lib/links";

type Props = {
  plans: { id: number; name: string }[];
  canEdit: boolean;
  initial: { q: string; type: string; planId: string; unplaced: boolean; id: number | null };
};

type SortKey = "name" | "type" | "ip" | "assignedUser" | "location" | "plan";

function ipKey(ip: string | null) {
  if (!ip) return "~";
  const v4 = ip.split("/")[0].split(".");
  return v4.length === 4 ? v4.map((n) => n.padStart(3, "0")).join(".") : ip;
}

export default function DeviceList({ plans, canEdit, initial }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [type, setType] = useState(initial.type);
  const [planId, setPlanId] = useState(initial.planId);
  const [unplaced, setUnplaced] = useState(initial.unplaced);
  const [devices, setDevices] = useState<DeviceDTO[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(initial.id);
  const [editing, setEditing] = useState<DeviceDTO | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "name", asc: true });

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "2000" });
    if (q.trim()) params.set("q", q.trim());
    if (type) params.set("type", type);
    if (planId) params.set("planId", planId);
    setDevices(await api<DeviceDTO[]>(`/api/devices?${params}`).catch(() => []));
  }, [q, type, planId]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (type) params.set("type", type);
    if (planId) params.set("planId", planId);
    if (unplaced) params.set("unplaced", "1");
    window.history.replaceState(null, "", `/devices${params.size ? `?${params}` : ""}`);
  }, [q, type, planId, unplaced]);

  const rows = useMemo(() => {
    let list = devices ?? [];
    if (unplaced) list = list.filter((d) => !d.planId || d.x === null);
    const val = (d: DeviceDTO): string => {
      switch (sort.key) {
        case "ip": return ipKey(d.ip);
        case "plan": return `${d.plan?.name ?? "~"} ${d.zone?.name ?? ""}`;
        case "type": return deviceType(d.type).label;
        default: return (d[sort.key] ?? "~").toString().toLowerCase();
      }
    };
    return [...list].sort((a, b) => val(a).localeCompare(val(b), "fr", { numeric: true }) * (sort.asc ? 1 : -1));
  }, [devices, unplaced, sort]);

  const selected = rows.find((d) => d.id === selectedId) ?? devices?.find((d) => d.id === selectedId) ?? null;

  function header(key: SortKey, label: string) {
    const active = sort.key === key;
    return (
      <th className="cursor-pointer px-3 py-2 text-left font-semibold select-none hover:text-slate-900" onClick={() => setSort({ key, asc: active ? !sort.asc : true })}>
        {label} {active ? (sort.asc ? "▲" : "▼") : ""}
      </th>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-lg font-semibold">Appareils</h1>
          <a href="/api/export" className="btn btn-sm">⬇ Export Excel</a>
          {canEdit && (
            <>
              <button className="btn btn-sm" onClick={() => setImporting(true)}>⬆ Import Excel</button>
              <button className="btn btn-sm btn-primary" onClick={() => setEditing("new")}>+ Nouvel appareil</button>
            </>
          )}
        </div>

        <div className="card flex flex-wrap gap-2 p-3">
          <input className="input min-w-48 flex-1" placeholder="Nom, IP, MAC, utilisateur, description, localisation…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Tous les types</option>
            {DEVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </select>
          <select className="input w-auto" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Tous les plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={unplaced} onChange={(e) => setUnplaced(e.target.checked)} /> Non placés
          </label>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600 uppercase">
              <tr>
                {header("name", "Nom")}
                {header("type", "Type")}
                {header("ip", "IP")}
                {header("assignedUser", "Utilisateur")}
                {header("location", "Localisation")}
                {header("plan", "Plan / zone")}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices === null && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Chargement…</td></tr>
              )}
              {devices !== null && rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Aucun appareil ne correspond.</td></tr>
              )}
              {rows.map((d) => {
                const t = deviceType(d.type);
                return (
                  <tr key={d.id} onClick={() => setSelectedId(d.id)} className={`cursor-pointer ${d.id === selectedId ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <td className="px-3 py-2 font-medium">{d.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{t.icon} {t.label}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.ip}</td>
                    <td className="px-3 py-2">{d.assignedUser}</td>
                    <td className="px-3 py-2 text-slate-600">{d.location}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.plan ? (
                        <Link href={`/plans/${d.plan.id}?device=${d.id}`} onClick={(e) => e.stopPropagation()} className="text-blue-700 hover:underline">
                          {d.plan.name}
                          {d.zone && <span style={{ color: d.zone.color }}> · {d.zone.name}</span>}
                          {d.x === null && <span className="text-amber-600" title="Non positionné"> ⚠</span>}
                        </Link>
                      ) : (
                        <span className="text-amber-600">Non placé</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {devices && <p className="text-xs text-slate-500">{rows.length} appareil(s)</p>}
      </div>

      {selected && (
        <div className="w-full shrink-0 lg:sticky lg:top-20 lg:w-80 lg:self-start">
          <DeviceDetails device={selected} showPlanLink onClose={() => setSelectedId(null)} onEdit={canEdit ? () => setEditing(selected) : undefined} moveHref={canEdit ? moveDeviceHref(selected) : undefined} />
        </div>
      )}

      {editing && (
        <DeviceForm
          device={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(d) => {
            setEditing(null);
            setSelectedId(d.id);
            load();
          }}
          onDeleted={() => {
            setEditing(null);
            setSelectedId(null);
            load();
          }}
        />
      )}
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onDone={() => {
            load();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
