"use client";
import Link from "next/link";
import { deviceType, type DeviceDTO } from "@/lib/types";
import { personHref } from "@/lib/links";

export default function DeviceDetails({
  device,
  onEdit,
  onClose,
  showPlanLink,
  moveHref,
}: {
  device: DeviceDTO;
  onEdit?: () => void;
  /** Lien vers l'éditeur, prêt à poser l'appareil (modérateurs). */
  moveHref?: string;
  onClose?: () => void;
  showPlanLink?: boolean;
}) {
  const t = deviceType(device.type);
  const rows: [string, React.ReactNode][] = [
    ["Type", `${t.icon} ${t.label}`],
    ["Adresse IP", device.ip ? <code className="font-mono">{device.ip}</code> : null],
    ["Adresse MAC", device.mac ? <code className="font-mono">{device.mac}</code> : null],
    [
      "Utilisateur",
      device.assignedUser ? (
        <Link href={personHref(device.assignedUser)} className="text-blue-700 hover:underline" title="Voir tous ses appareils">
          👤 {device.assignedUser}
        </Link>
      ) : null,
    ],
    ["Localisation", device.location],
    ["Plan", device.plan?.name ?? <span className="text-amber-600">Non placé</span>],
    [
      "Zone",
      device.zone ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: device.zone.color }} />
          {device.zone.name}
        </span>
      ) : null,
    ],
    ["Description", device.description ? <span className="whitespace-pre-wrap">{device.description}</span> : null],
  ];
  return (
    <div className="card w-full overflow-hidden">
      <div className="flex items-start gap-3 border-b border-slate-200 p-3" style={{ borderTop: `4px solid ${t.color}` }}>
        <span className="text-3xl leading-none">{t.icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{device.name}</h3>
          <p className="text-xs text-slate-500">{t.label}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Fermer">
            ✕
          </button>
        )}
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-2 px-3 py-1.5">
            <dt className="text-slate-500">{label}</dt>
            <dd className="min-w-0 break-words">{value ?? <span className="text-slate-300">—</span>}</dd>
          </div>
        ))}
      </dl>
      {(onEdit || moveHref || (showPlanLink && device.planId)) && (
        <div className="flex gap-2 border-t border-slate-200 bg-slate-50 p-2">
          {showPlanLink && device.planId && (
            <Link href={`/plans/${device.planId}?device=${device.id}`} className="btn btn-sm btn-primary">
              📍 Voir sur le plan
            </Link>
          )}
          {moveHref && (
            <Link href={moveHref} className="btn btn-sm" title="Ouvre l'éditeur du plan : cliquez ensuite à l'endroit voulu">
              📍 {device.x === null ? "Placer sur le plan" : "Déplacer"}
            </Link>
          )}
          {onEdit && (
            <button className="btn btn-sm" onClick={onEdit}>
              ✏️ Modifier
            </button>
          )}
        </div>
      )}
    </div>
  );
}
