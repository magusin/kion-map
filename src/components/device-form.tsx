"use client";
import { useEffect, useState } from "react";
import Modal from "./modal";
import { api } from "@/lib/client";
import { DEVICE_TYPES, type DeviceDTO } from "@/lib/types";
import type { PlanSummary } from "@/lib/types-client";

type Props = {
  device?: DeviceDTO | null;
  /** Valeurs initiales pour une création (ex. plan courant). */
  defaults?: Partial<DeviceDTO>;
  onClose: () => void;
  onSaved: (d: DeviceDTO) => void;
  onDeleted?: (id: number) => void;
};

export default function DeviceForm({ device, defaults, onClose, onSaved, onDeleted }: Props) {
  const init = device ?? defaults ?? {};
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [planId, setPlanId] = useState<number | null>(init.planId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<PlanSummary[]>("/api/plans").then(setPlans).catch(() => {});
  }, []);

  const zones = plans.find((p) => p.id === planId)?.zones ?? [];
  const positioned = device && device.x !== null && device.planId === planId;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      name: f.get("name"),
      type: f.get("type"),
      ip: f.get("ip"),
      mac: f.get("mac"),
      assignedUser: f.get("assignedUser"),
      location: f.get("location"),
      description: f.get("description"),
      planId,
    };
    // La zone d'un appareil positionné est déduite de sa position sur le plan.
    if (!positioned) body.zoneId = Number(f.get("zoneId")) || null;
    if (!device) {
      body.x = defaults?.x ?? null;
      body.y = defaults?.y ?? null;
    }
    setBusy(true);
    setError(null);
    try {
      const saved = device
        ? await api<DeviceDTO>(`/api/devices/${device.id}`, { method: "PATCH", body })
        : await api<DeviceDTO>("/api/devices", { body });
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!device || !confirm(`Supprimer définitivement « ${device.name} » ?`)) return;
    try {
      await api(`/api/devices/${device.id}`, { method: "DELETE" });
      onDeleted?.(device.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Modal title={device ? `Modifier ${device.name}` : "Nouvel appareil"} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Nom *</label>
          <input name="name" className="input" defaultValue={init.name ?? ""} required autoFocus />
        </div>
        <div>
          <label className="label">Type</label>
          <select name="type" className="input" defaultValue={init.type ?? "pc"}>
            {DEVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Adresse IP</label>
          <input name="ip" className="input font-mono" defaultValue={init.ip ?? ""} placeholder="192.168.1.10" />
        </div>
        <div>
          <label className="label">Adresse MAC</label>
          <input name="mac" className="input font-mono" defaultValue={init.mac ?? ""} placeholder="00:1A:2B:3C:4D:5E" />
        </div>
        <div>
          <label className="label">Utilisateur</label>
          <input name="assignedUser" className="input" defaultValue={init.assignedUser ?? ""} />
        </div>
        <div>
          <label className="label">Localisation</label>
          <input name="location" className="input" defaultValue={init.location ?? ""} placeholder="Bureau 12, Baie A - U12…" />
        </div>
        <div>
          <label className="label">Plan</label>
          <select className="input" value={planId ?? ""} onChange={(e) => setPlanId(Number(e.target.value) || null)}>
            <option value="">— Aucun —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Zone</label>
          {positioned ? (
            <p className="py-1.5 text-sm text-slate-500">Déduite de la position sur le plan{device?.zone ? ` : ${device.zone.name}` : ""}</p>
          ) : (
            <select name="zoneId" className="input" defaultValue={init.zoneId ?? ""} key={planId ?? 0} disabled={!planId}>
              <option value="">— Aucune —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="label">Description</label>
          <textarea name="description" className="input" rows={3} defaultValue={init.description ?? ""} />
        </div>
        {device && device.planId !== planId && device.x !== null && (
          <p className="text-xs text-amber-700 sm:col-span-2">Changer de plan retire l&apos;appareil de sa position actuelle.</p>
        )}
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>}
        <div className="flex items-center gap-2 sm:col-span-2">
          {device && onDeleted && (
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              Supprimer
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn" onClick={onClose}>
              Annuler
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
