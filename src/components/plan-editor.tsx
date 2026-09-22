"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PlanCanvas, { type CanvasTarget } from "./plan-canvas";
import DeviceForm from "./device-form";
import Modal from "./modal";
import { api } from "@/lib/client";
import { deviceType, type DeviceDTO, type PlanDTO, type Point, type Shape, type ZoneDTO } from "@/lib/types";

type Tool = "select" | "wall" | "room" | "text" | "zone" | "place";
type Selection = { kind: "shape"; id: string } | { kind: "zone"; id: number } | { kind: "device"; id: number } | null;
type Drag =
  | { kind: "device"; id: number; offset: Point; moved: boolean }
  | { kind: "shape"; id: string; start: Point; orig: Shape; moved: boolean }
  | { kind: "zone"; id: number; start: Point; orig: Point[]; moved: boolean }
  | { kind: "vertex"; zoneId: number; index: number; moved: boolean }
  | { kind: "room"; start: Point }
  | null;

const TOOLS: { id: Tool; label: string; icon: string; hint: string }[] = [
  { id: "select", label: "Sélection", icon: "🖱️", hint: "Cliquez pour sélectionner, glissez pour déplacer. Glisser le fond déplace la vue, molette = zoom." },
  { id: "wall", label: "Mur", icon: "📏", hint: "Cliquez point par point. Double-clic ou Entrée pour terminer. Maj = angle droit." },
  { id: "room", label: "Pièce", icon: "⬜", hint: "Glissez pour tracer un rectangle." },
  { id: "text", label: "Texte", icon: "🔤", hint: "Cliquez à l'endroit du texte." },
  { id: "zone", label: "Zone", icon: "🔷", hint: "Cliquez les sommets du polygone. Cliquez le 1er point, double-cliquez ou Entrée pour fermer." },
];

const ZONE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

const uid = () => Math.random().toString(36).slice(2, 10);

function translateShape(s: Shape, dx: number, dy: number): Shape {
  if (s.kind === "wall") return { ...s, points: s.points.map(([x, y]) => [x + dx, y + dy] as Point) };
  return { ...s, x: s.x + dx, y: s.y + dy };
}

export default function PlanEditor(props: { plan: PlanDTO; zones: ZoneDTO[]; devices: DeviceDTO[] }) {
  const router = useRouter();
  const [plan, setPlan] = useState(props.plan);
  const [shapes, setShapes] = useState<Shape[]>(props.plan.shapes);
  const [history, setHistory] = useState<Shape[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [zones, setZones] = useState(props.zones);
  const [devices, setDevices] = useState(props.devices);
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<Selection>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [snap, setSnap] = useState(true);
  const [grid, setGrid] = useState(true);
  const [placing, setPlacing] = useState<number | null>(null);
  const [zoneFor, setZoneFor] = useState<number | null>(null); // zone existante à (re)dessiner
  const [newZone, setNewZone] = useState<Point[] | null>(null);
  const [editDevice, setEditDevice] = useState<DeviceDTO | null>(null);
  const [newDeviceAt, setNewDeviceAt] = useState<Point | null>(null);
  const [tab, setTab] = useState<"props" | "devices" | "zones" | "plan">("devices");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const scaleRef = useRef(1);

  const flash = useCallback((text: string, error = false) => {
    setMsg({ text, error });
    setTimeout(() => setMsg((m) => (m?.text === text ? null : m)), 3500);
  }, []);

  const planDevices = devices.filter((d) => d.planId === plan.id);
  const toPlace = devices.filter((d) => d.planId === null || (d.planId === plan.id && d.x === null));

  const sn = useCallback((p: Point): Point => (snap ? [Math.round(p[0] / 10) * 10, Math.round(p[1] / 10) * 10] : [Math.round(p[0]), Math.round(p[1])]), [snap]);

  function commitShapes(next: Shape[]) {
    setHistory((h) => [...h.slice(-49), shapes]);
    setShapes(next);
    setDirty(true);
  }

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      setShapes(h[h.length - 1]);
      setDirty(true);
      return h.slice(0, -1);
    });
  }, []);

  async function saveShapes() {
    setSaving(true);
    try {
      await api(`/api/plans/${plan.id}`, { method: "PATCH", body: { shapes } });
      setDirty(false);
      flash("Dessin enregistré");
    } catch (err) {
      flash((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function chooseTool(t: Tool) {
    setTool(t);
    setDraft([]);
    setPlacing(null);
    if (t !== "zone") setZoneFor(null);
  }

  // ---- Appareils -----------------------------------------------------------
  async function patchDevice(id: number, body: Record<string, unknown>) {
    try {
      const d = await api<DeviceDTO>(`/api/devices/${id}`, { method: "PATCH", body });
      setDevices((all) => all.map((x) => (x.id === id ? d : x)));
      return d;
    } catch (err) {
      flash((err as Error).message, true);
      return null;
    }
  }

  // ---- Zones ---------------------------------------------------------------
  async function saveZonePoints(id: number, points: Point[]) {
    try {
      const z = await api<ZoneDTO>(`/api/zones/${id}`, { method: "PATCH", body: { points } });
      setZones((all) => all.map((x) => (x.id === id ? z : x)));
      await refreshDeviceZones();
    } catch (err) {
      flash((err as Error).message, true);
    }
  }

  async function refreshDeviceZones() {
    const fresh = await api<DeviceDTO[]>(`/api/devices?planId=${plan.id}&limit=2000`).catch(() => null);
    if (!fresh) return;
    const byId = new Map(fresh.map((d) => [d.id, d]));
    setDevices((all) => all.map((d) => byId.get(d.id) ?? d));
  }

  function finishPolygon(points: Point[]) {
    const pts = points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1);
    if (tool === "wall") {
      if (pts.length >= 2) commitShapes([...shapes, { id: uid(), kind: "wall", points: pts }]);
    } else if (tool === "zone") {
      if (pts.length < 3) return flash("Une zone nécessite au moins 3 points", true);
      if (zoneFor) {
        saveZonePoints(zoneFor, pts);
        setSel({ kind: "zone", id: zoneFor });
        setZoneFor(null);
        setTool("select");
      } else setNewZone(pts);
    }
    setDraft([]);
  }

  // ---- Interaction canvas --------------------------------------------------
  function onPointerDown(e: React.PointerEvent, raw: Point, target: CanvasTarget): boolean {
    const pt = sn(raw);
    const capture = () => (e.currentTarget as Element).setPointerCapture(e.pointerId);

    if (tool === "place" && placing) {
      const id = placing;
      setPlacing(null);
      setTool("select");
      patchDevice(id, { planId: plan.id, x: pt[0], y: pt[1] }).then((d) => d && setSel({ kind: "device", id: d.id }));
      return true;
    }
    if (tool === "wall" || tool === "zone") {
      let p = pt;
      if (tool === "wall" && e.shiftKey && draft.length) {
        const last = draft[draft.length - 1];
        p = Math.abs(p[0] - last[0]) > Math.abs(p[1] - last[1]) ? [p[0], last[1]] : [last[0], p[1]];
      }
      if (tool === "zone" && draft.length >= 3) {
        const [fx, fy] = draft[0];
        if (Math.hypot(raw[0] - fx, raw[1] - fy) < 12 * scaleRef.current) {
          finishPolygon(draft);
          return true;
        }
      }
      setDraft((d) => [...d, p]);
      return true;
    }
    if (tool === "room") {
      capture();
      setDrag({ kind: "room", start: pt });
      return true;
    }
    if (tool === "text") {
      const text = prompt("Texte à afficher :");
      if (text?.trim()) commitShapes([...shapes, { id: uid(), kind: "text", x: pt[0], y: pt[1], text: text.trim(), size: 18 }]);
      return true;
    }

    // Sélection
    if (target.kind === "device") {
      const d = devices.find((x) => x.id === target.id);
      if (!d || d.x === null || d.y === null) return true;
      setSel({ kind: "device", id: d.id });
      setTab("props");
      capture();
      setDrag({ kind: "device", id: d.id, offset: [raw[0] - d.x, raw[1] - d.y], moved: false });
      return true;
    }
    if (target.kind === "handle") {
      const [zoneId, index] = target.id.split(":").map(Number);
      capture();
      setDrag({ kind: "vertex", zoneId, index, moved: false });
      return true;
    }
    if (target.kind === "shape") {
      const s = shapes.find((x) => x.id === target.id);
      if (!s) return true;
      setSel({ kind: "shape", id: s.id });
      setTab("props");
      capture();
      setDrag({ kind: "shape", id: s.id, start: raw, orig: s, moved: false });
      return true;
    }
    if (target.kind === "zone") {
      const z = zones.find((x) => x.id === target.id);
      if (!z) return true;
      const already = sel?.kind === "zone" && sel.id === z.id;
      setSel({ kind: "zone", id: z.id });
      setTab("props");
      if (already) {
        capture();
        setDrag({ kind: "zone", id: z.id, start: raw, orig: z.points, moved: false });
      }
      return true;
    }
    setSel(null);
    return false; // laisse la vue se déplacer
  }

  function onPointerMove(e: React.PointerEvent, raw: Point) {
    setCursor(raw);
    if (!drag) return;
    if (drag.kind === "device") {
      const [x, y] = sn([raw[0] - drag.offset[0], raw[1] - drag.offset[1]]);
      setDevices((all) => all.map((d) => (d.id === drag.id ? { ...d, x, y } : d)));
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else if (drag.kind === "shape") {
      const [dx, dy] = sn([raw[0] - drag.start[0], raw[1] - drag.start[1]]);
      setShapes((all) => all.map((s) => (s.id === drag.id ? translateShape(drag.orig, dx, dy) : s)));
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else if (drag.kind === "zone") {
      const [dx, dy] = sn([raw[0] - drag.start[0], raw[1] - drag.start[1]]);
      setZones((all) => all.map((z) => (z.id === drag.id ? { ...z, points: drag.orig.map(([x, y]) => [x + dx, y + dy] as Point) } : z)));
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else if (drag.kind === "vertex") {
      const p = sn(raw);
      setZones((all) => all.map((z) => (z.id === drag.zoneId ? { ...z, points: z.points.map((q, i) => (i === drag.index ? p : q)) } : z)));
      if (!drag.moved) setDrag({ ...drag, moved: true });
    }
  }

  function onPointerUp(_e: React.PointerEvent, raw: Point) {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === "room") {
      const p = sn(raw);
      const x = Math.min(d.start[0], p[0]);
      const y = Math.min(d.start[1], p[1]);
      const w = Math.abs(p[0] - d.start[0]);
      const h = Math.abs(p[1] - d.start[1]);
      if (w > 10 && h > 10) {
        const label = prompt("Nom de la pièce (facultatif) :") ?? "";
        commitShapes([...shapes, { id: uid(), kind: "room", x, y, w, h, ...(label.trim() ? { label: label.trim() } : {}) }]);
      }
      return;
    }
    if (!d.moved) return;
    if (d.kind === "device") {
      const dev = devices.find((x) => x.id === d.id);
      if (dev && dev.x !== null) patchDevice(d.id, { x: dev.x, y: dev.y });
    } else if (d.kind === "shape") {
      setHistory((h) => [...h.slice(-49), shapes.map((s) => (s.id === d.id ? d.orig : s))]);
      setDirty(true);
    } else if (d.kind === "zone" || d.kind === "vertex") {
      const id = d.kind === "zone" ? d.id : d.zoneId;
      const z = zones.find((x) => x.id === id);
      if (z) saveZonePoints(id, z.points);
    }
  }

  // ---- Clavier -------------------------------------------------------------
  const deleteSelection = useCallback(async () => {
    if (!sel) return;
    if (sel.kind === "shape") {
      setHistory((h) => [...h.slice(-49), shapes]);
      setShapes((all) => all.filter((s) => s.id !== sel.id));
      setDirty(true);
      setSel(null);
    } else if (sel.kind === "zone") {
      const z = zones.find((x) => x.id === sel.id);
      if (!z || !confirm(`Supprimer la zone « ${z.name} » ? Les appareils restent sur le plan.`)) return;
      try {
        await api(`/api/zones/${z.id}`, { method: "DELETE" });
        setZones((all) => all.filter((x) => x.id !== z.id));
        setDevices((all) => all.map((d) => (d.zoneId === z.id ? { ...d, zoneId: null, zone: null } : d)));
        setSel(null);
      } catch (err) {
        flash((err as Error).message, true);
      }
    } else if (sel.kind === "device") {
      const d = devices.find((x) => x.id === sel.id);
      if (d && confirm(`Retirer « ${d.name} » du plan ? (l'appareil n'est pas supprimé)`)) {
        await patchDevice(d.id, { x: null, y: null, zoneId: null });
        setSel(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, shapes, zones, devices]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [role=dialog]")) return;
      if (e.key === "Escape") {
        setDraft([]);
        setPlacing(null);
        setSel(null);
        if (tool === "place") setTool("select");
      } else if (e.key === "Enter" && draft.length) finishPolygon(draft);
      else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        deleteSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveShapes();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Rendu de l'overlay --------------------------------------------------
  const overlay = (u: number) => {
    scaleRef.current = u;
    const items: React.ReactNode[] = [];
    if (draft.length && cursor && (tool === "wall" || tool === "zone")) {
      const c = sn(cursor);
      const pts = [...draft, c];
      items.push(
        <polyline key="draft" points={pts.map((p) => p.join(",")).join(" ")} fill={tool === "zone" ? "#3b82f633" : "none"} stroke={tool === "zone" ? "#2563eb" : "#0f172a"} strokeWidth={tool === "zone" ? 2 * u : 6} strokeDasharray={tool === "zone" ? `${6 * u} ${4 * u}` : undefined} pointerEvents="none" />,
      );
      draft.forEach((p, i) => items.push(<circle key={`dp${i}`} cx={p[0]} cy={p[1]} r={(i === 0 ? 6 : 4) * u} fill={i === 0 ? "#2563eb" : "#fff"} stroke="#2563eb" strokeWidth={2 * u} pointerEvents="none" />));
    }
    if (drag?.kind === "room" && cursor) {
      const p = sn(cursor);
      items.push(
        <rect key="room" x={Math.min(drag.start[0], p[0])} y={Math.min(drag.start[1], p[1])} width={Math.abs(p[0] - drag.start[0])} height={Math.abs(p[1] - drag.start[1])} fill="#2563eb22" stroke="#2563eb" strokeWidth={2 * u} strokeDasharray={`${6 * u} ${4 * u}`} pointerEvents="none" />,
      );
    }
    if (sel?.kind === "zone" && tool === "select") {
      const z = zones.find((x) => x.id === sel.id);
      z?.points.forEach((p, i) =>
        items.push(<rect key={`h${i}`} data-kind="handle" data-id={`${z.id}:${i}`} x={p[0] - 5 * u} y={p[1] - 5 * u} width={10 * u} height={10 * u} fill="#fff" stroke={z.color} strokeWidth={2 * u} style={{ cursor: "move" }} />),
      );
    }
    if (tool === "place" && cursor && placing) {
      const d = devices.find((x) => x.id === placing);
      if (d) items.push(<text key="ghost" x={cursor[0]} y={cursor[1]} fontSize={26 * u} textAnchor="middle" dominantBaseline="central" opacity={0.7} pointerEvents="none">{deviceType(d.type).icon}</text>);
    }
    return items;
  };

  const selectedShape = sel?.kind === "shape" ? shapes.find((s) => s.id === sel.id) : undefined;
  const selectedZone = sel?.kind === "zone" ? zones.find((z) => z.id === sel.id) : undefined;
  const selectedDevice = sel?.kind === "device" ? devices.find((d) => d.id === sel.id) : undefined;
  const hint = tool === "place" ? "Cliquez sur le plan pour positionner l'appareil (Échap pour annuler)." : TOOLS.find((t) => t.id === tool)?.hint;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <Link href={`/plans/${plan.id}`} className="btn btn-sm" onClick={(e) => dirty && !confirm("Des modifications du dessin ne sont pas enregistrées. Quitter ?") && e.preventDefault()}>
          ← Retour
        </Link>
        <h1 className="mr-2 font-semibold">{plan.name}</h1>
        <div className="flex overflow-hidden rounded-md border border-slate-300">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => chooseTool(t.id)}
              className={`border-r border-slate-200 px-2.5 py-1 text-sm last:border-0 ${tool === t.id ? "bg-blue-600 text-white" : "bg-white hover:bg-slate-50"}`}
              title={t.hint}
            >
              {t.icon} <span className="hidden lg:inline">{t.label}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Magnétisme
        </label>
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grille
        </label>
        <button className="btn btn-sm" onClick={undo} disabled={!history.length} title="Annuler (Ctrl+Z)">
          ↶ Annuler
        </button>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className={`text-sm ${msg.error ? "text-red-600" : "text-green-700"}`}>{msg.text}</span>}
          <button className="btn btn-primary btn-sm" onClick={saveShapes} disabled={!dirty || saving} title="Ctrl+S">
            {saving ? "Enregistrement…" : dirty ? "💾 Enregistrer le dessin" : "✓ Dessin enregistré"}
          </button>
        </div>
      </div>
      <div className="truncate border-b border-slate-200 bg-blue-50 px-3 py-1 text-xs text-blue-900">
        {zoneFor && tool === "zone" ? `Dessin du contour de « ${zones.find((z) => z.id === zoneFor)?.name} » — ` : ""}
        {hint} Zones, appareils et réglages sont enregistrés immédiatement ; murs/pièces/textes via « Enregistrer le dessin ».
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <PlanCanvas
            plan={plan}
            shapes={shapes}
            zones={zones}
            devices={planDevices}
            highlightDeviceId={selectedDevice?.id}
            selectedZoneId={selectedZone?.id}
            selectedShapeId={selectedShape?.id}
            showGrid={grid}
            cursor={tool === "select" ? undefined : "crosshair"}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={() => draft.length && finishPolygon(draft)}
            overlay={overlay}
          />
        </div>

        {/* Panneau latéral */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
          <div className="grid grid-cols-4 border-b border-slate-200 text-xs">
            {(
              [
                ["props", "Sélection"],
                ["devices", `Appareils`],
                ["zones", "Zones"],
                ["plan", "Plan"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`py-2 ${tab === id ? "border-b-2 border-blue-600 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm">
            {tab === "props" && (
              <>
                {!sel && <p className="text-slate-500">Sélectionnez un élément du plan avec l&apos;outil 🖱️ Sélection.</p>}
                {selectedShape && (
                  <ShapeProps
                    shape={selectedShape}
                    onChange={(s) => commitShapes(shapes.map((x) => (x.id === s.id ? s : x)))}
                    onDelete={deleteSelection}
                  />
                )}
                {selectedZone && (
                  <ZoneProps
                    key={selectedZone.id}
                    zone={selectedZone}
                    count={planDevices.filter((d) => d.zoneId === selectedZone.id).length}
                    onSaved={(z) => setZones((all) => all.map((x) => (x.id === z.id ? z : x)))}
                    onRedraw={() => {
                      setZoneFor(selectedZone.id);
                      setTool("zone");
                      setDraft([]);
                    }}
                    onDelete={deleteSelection}
                    onError={(m) => flash(m, true)}
                  />
                )}
                {selectedDevice && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{deviceType(selectedDevice.type).icon}</span>
                      <div>
                        <div className="font-semibold">{selectedDevice.name}</div>
                        <div className="text-xs text-slate-500">
                          {selectedDevice.ip ?? "—"} · Zone : {selectedDevice.zone?.name ?? "aucune"}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">Glissez l&apos;appareil sur le plan pour le déplacer : sa zone est mise à jour automatiquement.</p>
                    <div className="flex flex-wrap gap-2">
                      <button className="btn btn-sm" onClick={() => setEditDevice(selectedDevice)}>✏️ Modifier</button>
                      <button className="btn btn-sm btn-danger" onClick={deleteSelection}>Retirer du plan</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {tab === "devices" && (
              <>
                <button className="btn btn-sm w-full" onClick={() => setNewDeviceAt([plan.width / 2, plan.height / 2])}>
                  + Nouvel appareil au centre du plan
                </button>
                <DevicePicker
                  title={`À placer (${toPlace.length})`}
                  devices={toPlace}
                  placing={placing}
                  empty="Tous les appareils sont placés."
                  onPick={(d) => {
                    setTool("place");
                    setPlacing(d.id);
                    setDraft([]);
                  }}
                />
                <DevicePicker
                  title={`Sur ce plan (${planDevices.filter((d) => d.x !== null).length})`}
                  devices={planDevices.filter((d) => d.x !== null)}
                  placing={placing}
                  empty="Aucun appareil placé."
                  actionLabel="Déplacer"
                  onSelect={(d) => {
                    setSel({ kind: "device", id: d.id });
                    setTab("props");
                  }}
                  onPick={(d) => {
                    setTool("place");
                    setPlacing(d.id);
                  }}
                />
              </>
            )}

            {tab === "zones" && (
              <>
                <button className="btn btn-sm w-full" onClick={() => chooseTool("zone")}>
                  🔷 Dessiner une nouvelle zone
                </button>
                <ul className="space-y-1">
                  {zones.map((z) => (
                    <li key={z.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${sel?.kind === "zone" && sel.id === z.id ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
                      <span className="h-3 w-3 rounded-sm" style={{ background: z.color }} />
                      <button
                        className="flex-1 truncate text-left"
                        onClick={() => {
                          setSel({ kind: "zone", id: z.id });
                          setTab("props");
                          setTool("select");
                        }}
                      >
                        {z.name}
                      </button>
                      {z.points.length < 3 && (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setZoneFor(z.id);
                            setTool("zone");
                            setDraft([]);
                          }}
                        >
                          Dessiner
                        </button>
                      )}
                    </li>
                  ))}
                  {!zones.length && <li className="text-slate-500">Aucune zone.</li>}
                </ul>
              </>
            )}

            {tab === "plan" && (
              <PlanSettings
                plan={plan}
                onSaved={(p) => setPlan((cur) => ({ ...cur, ...p }))}
                onDeleted={() => router.push("/")}
                flash={flash}
              />
            )}
          </div>
        </aside>
      </div>

      {newZone && (
        <NewZoneModal
          planId={plan.id}
          points={newZone}
          defaultColor={ZONE_COLORS[zones.length % ZONE_COLORS.length]}
          onClose={() => setNewZone(null)}
          onCreated={async (z) => {
            setZones((all) => [...all, z].sort((a, b) => a.name.localeCompare(b.name)));
            setNewZone(null);
            setSel({ kind: "zone", id: z.id });
            setTool("select");
            await refreshDeviceZones();
          }}
        />
      )}
      {(editDevice || newDeviceAt) && (
        <DeviceForm
          device={editDevice}
          defaults={newDeviceAt ? { planId: plan.id, x: newDeviceAt[0], y: newDeviceAt[1] } : undefined}
          onClose={() => {
            setEditDevice(null);
            setNewDeviceAt(null);
          }}
          onSaved={(d) => {
            setDevices((all) => (all.some((x) => x.id === d.id) ? all.map((x) => (x.id === d.id ? d : x)) : [...all, d]));
            if (d.planId === plan.id && d.x !== null) setSel({ kind: "device", id: d.id });
            setEditDevice(null);
            setNewDeviceAt(null);
          }}
          onDeleted={(id) => {
            setDevices((all) => all.filter((x) => x.id !== id));
            setSel(null);
            setEditDevice(null);
          }}
        />
      )}
    </div>
  );
}

function DevicePicker({
  title,
  devices,
  placing,
  empty,
  actionLabel = "Placer",
  onPick,
  onSelect,
}: {
  title: string;
  devices: DeviceDTO[];
  placing: number | null;
  empty: string;
  actionLabel?: string;
  onPick: (d: DeviceDTO) => void;
  onSelect?: (d: DeviceDTO) => void;
}) {
  const [q, setQ] = useState("");
  const list = devices.filter((d) => !q || [d.name, d.ip, d.assignedUser].some((v) => v?.toLowerCase().includes(q.toLowerCase())));
  return (
    <section>
      <h3 className="label">{title}</h3>
      {devices.length > 8 && <input className="input mb-2" placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />}
      <ul className="space-y-1">
        {list.map((d) => (
          <li key={d.id} className={`flex items-center gap-2 rounded border px-2 py-1 ${placing === d.id ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
            <span>{deviceType(d.type).icon}</span>
            <button className="min-w-0 flex-1 text-left" onClick={() => onSelect?.(d)} disabled={!onSelect}>
              <span className="block truncate font-medium">{d.name}</span>
              <span className="block truncate text-xs text-slate-500">{[d.ip, d.zone?.name].filter(Boolean).join(" · ")}</span>
            </button>
            <button className="btn btn-sm" onClick={() => onPick(d)}>
              {placing === d.id ? "…" : actionLabel}
            </button>
          </li>
        ))}
        {!devices.length && <li className="text-slate-500">{empty}</li>}
      </ul>
    </section>
  );
}

function ShapeProps({ shape, onChange, onDelete }: { shape: Shape; onChange: (s: Shape) => void; onDelete: () => void }) {
  const names = { wall: "Mur", room: "Pièce", text: "Texte" };
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{names[shape.kind]}</h3>
      {shape.kind === "room" && (
        <>
          <label className="label">Nom de la pièce</label>
          <input className="input" defaultValue={shape.label ?? ""} key={shape.id} onBlur={(e) => e.target.value !== (shape.label ?? "") && onChange({ ...shape, label: e.target.value || undefined })} />
          <p className="text-xs text-slate-500">
            {Math.round(shape.w)} × {Math.round(shape.h)} px
          </p>
        </>
      )}
      {shape.kind === "text" && (
        <>
          <label className="label">Texte</label>
          <input className="input" defaultValue={shape.text} key={shape.id} onBlur={(e) => e.target.value && e.target.value !== shape.text && onChange({ ...shape, text: e.target.value })} />
          <label className="label">Taille</label>
          <input className="input" type="number" min={6} max={200} defaultValue={shape.size} key={`${shape.id}s`} onBlur={(e) => onChange({ ...shape, size: Math.min(200, Math.max(6, Number(e.target.value) || 18)) })} />
        </>
      )}
      {shape.kind === "wall" && <p className="text-xs text-slate-500">{shape.points.length} points. Glissez pour déplacer.</p>}
      <button className="btn btn-sm btn-danger" onClick={onDelete}>
        Supprimer (Suppr)
      </button>
    </div>
  );
}

function ZoneProps({
  zone,
  count,
  onSaved,
  onRedraw,
  onDelete,
  onError,
}: {
  zone: ZoneDTO;
  count: number;
  onSaved: (z: ZoneDTO) => void;
  onRedraw: () => void;
  onDelete: () => void;
  onError: (m: string) => void;
}) {
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      onSaved(await api<ZoneDTO>(`/api/zones/${zone.id}`, { method: "PATCH", body: { name: f.get("name"), color: f.get("color"), description: f.get("description") } }));
    } catch (err) {
      onError((err as Error).message);
    }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <h3 className="font-semibold">Zone</h3>
      <div>
        <label className="label">Nom</label>
        <input name="name" className="input" defaultValue={zone.name} required />
      </div>
      <div>
        <label className="label">Couleur</label>
        <input name="color" type="color" className="h-8 w-16 cursor-pointer rounded border border-slate-300" defaultValue={zone.color} />
      </div>
      <div>
        <label className="label">Description</label>
        <textarea name="description" className="input" rows={2} defaultValue={zone.description ?? ""} />
      </div>
      <p className="text-xs text-slate-500">
        {count} appareil(s). {zone.points.length >= 3 ? "Glissez les poignées pour modifier le contour ; glissez la zone sélectionnée pour la déplacer." : "Contour non dessiné."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm btn-primary">Enregistrer</button>
        <button type="button" className="btn btn-sm" onClick={onRedraw}>
          Redessiner
        </button>
        <button type="button" className="btn btn-sm btn-danger" onClick={onDelete}>
          Supprimer
        </button>
      </div>
    </form>
  );
}

function NewZoneModal({
  planId,
  points,
  defaultColor,
  onClose,
  onCreated,
}: {
  planId: number;
  points: Point[];
  defaultColor: string;
  onClose: () => void;
  onCreated: (z: ZoneDTO) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      onCreated(await api<ZoneDTO>(`/api/plans/${planId}/zones`, { body: { name: f.get("name"), color: f.get("color"), description: f.get("description"), points } }));
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Modal title="Nouvelle zone" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label">Nom</label>
          <input name="name" className="input" required autoFocus placeholder="ex. Salle serveur, Open space…" />
        </div>
        <div>
          <label className="label">Couleur</label>
          <input name="color" type="color" className="h-8 w-16 cursor-pointer rounded border border-slate-300" defaultValue={defaultColor} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea name="description" className="input" rows={2} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn btn-primary">Créer la zone</button>
        </div>
      </form>
    </Modal>
  );
}

function PlanSettings({
  plan,
  onSaved,
  onDeleted,
  flash,
}: {
  plan: PlanDTO;
  onSaved: (p: Partial<PlanDTO>) => void;
  onDeleted: () => void;
  flash: (m: string, error?: boolean) => void;
}) {
  async function save(body: Record<string, unknown>) {
    try {
      await api(`/api/plans/${plan.id}`, { method: "PATCH", body });
      onSaved(body as Partial<PlanDTO>);
      flash("Plan mis à jour");
    } catch (err) {
      flash((err as Error).message, true);
    }
  }

  async function onBackground(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return flash("Image trop lourde (8 Mo max)", true);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    const img = new Image();
    img.src = dataUrl;
    await img.decode().catch(() => {});
    const body: Record<string, unknown> = { background: dataUrl };
    if (img.naturalWidth && confirm(`Adapter la taille du plan à l'image (${img.naturalWidth} × ${img.naturalHeight}) ?`)) {
      body.width = Math.min(10000, Math.max(200, img.naturalWidth));
      body.height = Math.min(10000, Math.max(200, img.naturalHeight));
    }
    await save(body);
  }

  async function onDelete() {
    if (!confirm(`Supprimer le plan « ${plan.name} » et toutes ses zones ? Les appareils sont conservés mais ne seront plus placés.`)) return;
    try {
      await api(`/api/plans/${plan.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      flash((err as Error).message, true);
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save({ name: f.get("name"), description: f.get("description"), width: Number(f.get("width")), height: Number(f.get("height")) });
        }}
      >
        <div>
          <label className="label">Nom</label>
          <input name="name" className="input" defaultValue={plan.name} required />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea name="description" className="input" rows={2} defaultValue={plan.description ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Largeur</label>
            <input name="width" type="number" className="input" defaultValue={plan.width} min={200} max={10000} key={`w${plan.width}`} />
          </div>
          <div>
            <label className="label">Hauteur</label>
            <input name="height" type="number" className="input" defaultValue={plan.height} min={200} max={10000} key={`h${plan.height}`} />
          </div>
        </div>
        <button className="btn btn-sm btn-primary">Enregistrer</button>
      </form>

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <h3 className="label">Image de fond</h3>
        <p className="text-xs text-slate-500">Importez un plan scanné ou exporté (PNG, JPG, SVG) puis dessinez les zones par-dessus.</p>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={onBackground} className="block w-full text-xs" />
        {plan.background && (
          <button className="btn btn-sm" onClick={() => save({ background: null })}>
            Retirer l&apos;image
          </button>
        )}
      </div>

      <div className="border-t border-slate-200 pt-3">
        <button className="btn btn-sm btn-danger" onClick={onDelete}>
          Supprimer ce plan
        </button>
      </div>
    </div>
  );
}
