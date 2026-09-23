"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { deviceType, type DeviceDTO, type PlanDTO, type Point, type Shape, type ZoneDTO } from "@/lib/types";

export type CanvasTarget =
  | { kind: "device"; id: number }
  | { kind: "zone"; id: number }
  | { kind: "shape"; id: string }
  | { kind: "handle"; id: string }
  | { kind: "background" };

export type CanvasHandlers = {
  /** Retourner true pour empêcher le déplacement de la vue. */
  onPointerDown?: (e: React.PointerEvent, pt: Point, target: CanvasTarget) => boolean | void;
  onPointerMove?: (e: React.PointerEvent, pt: Point) => void;
  onPointerUp?: (e: React.PointerEvent, pt: Point) => void;
  onDoubleClick?: (e: React.MouseEvent, pt: Point) => void;
};

type View = { x: number; y: number; w: number; h: number };
type FreeCamera = { kind: "free"; cx: number; cy: number; s: number }; // s = unités du plan par pixel écran
type Camera = { kind: "fit" } | { kind: "focus"; pt: Point } | FreeCamera;

function resolveCamera(c: Camera, plan: { width: number; height: number }, size: { w: number; h: number }) {
  if (c.kind === "free") return c;
  const fitS = Math.max((plan.width * 1.08) / size.w, (plan.height * 1.08) / size.h);
  if (c.kind === "fit") return { cx: plan.width / 2, cy: plan.height / 2, s: fitS };
  return { cx: c.pt[0], cy: c.pt[1], s: Math.min(fitS * 0.5, 700 / size.w) };
}

type Props = CanvasHandlers & {
  plan: Pick<PlanDTO, "width" | "height" | "background">;
  shapes: Shape[];
  zones: ZoneDTO[];
  devices: DeviceDTO[];
  highlightDeviceId?: number | null;
  selectedZoneId?: number | null;
  selectedShapeId?: string | null;
  hiddenZoneIds?: Set<number>;
  showLabels?: boolean;
  showGrid?: boolean;
  cursor?: string;
  /** Centre la vue sur ce point lorsqu'il change. */
  focus?: Point | null;
  onDeviceClick?: (d: DeviceDTO) => void;
  onZoneClick?: (z: ZoneDTO) => void;
  onBackgroundClick?: () => void;
  /** Éléments supplémentaires dessinés par-dessus (éditeur), avec l'échelle unités/pixel. */
  overlay?: (unitsPerPx: number) => React.ReactNode;
};

/** Point d'ancrage du nom d'une zone : son sommet le plus en haut à gauche.
 *  Le nom se place dans le coin de la zone, sans masquer les appareils au centre. */
export function labelAnchor(pts: Point[]): Point {
  return pts.reduce((best, p) => (p[0] + p[1] < best[0] + best[1] ? p : best), pts[0]);
}

function targetOf(el: EventTarget | null): CanvasTarget {
  const node = (el as Element | null)?.closest?.("[data-kind]");
  if (!node) return { kind: "background" };
  const kind = node.getAttribute("data-kind");
  const id = node.getAttribute("data-id") ?? "";
  if (kind === "device" || kind === "zone") return { kind, id: Number(id) };
  if (kind === "shape" || kind === "handle") return { kind, id };
  return { kind: "background" };
}

export default function PlanCanvas(props: Props) {
  const { plan, shapes, zones, devices, highlightDeviceId, selectedZoneId, selectedShapeId, hiddenZoneIds, showLabels = true, showGrid, focus } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  // La caméra est soit « tout afficher », soit centrée sur un point, soit libre (après zoom / déplacement).
  const [camera, setCamera] = useState<Camera>(focus ? { kind: "focus", pt: focus } : { kind: "fit" });
  const [panning, setPanning] = useState(false);
  const pan = useRef<{ id: number; sx: number; sy: number; cam: FreeCamera; moved: boolean; target: CanvasTarget } | null>(null);

  // Nouveau point de focus (ex. appareil sélectionné) : on recentre la vue.
  const focusKey = focus ? `${focus[0]},${focus[1]}` : "";
  const [prevFocusKey, setPrevFocusKey] = useState(focusKey);
  if (focusKey !== prevFocusKey) {
    setPrevFocusKey(focusKey);
    if (focus) setCamera({ kind: "focus", pt: focus });
  }

  const cam = resolveCamera(camera, plan, size);
  const view: View = { x: cam.cx - (size.w * cam.s) / 2, y: cam.cy - (size.h * cam.s) / 2, w: size.w * cam.s, h: size.h * cam.s };

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toPlan = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current!.getBoundingClientRect();
      return [view.x + ((clientX - rect.left) / rect.width) * view.w, view.y + ((clientY - rect.top) / rect.height) * view.h];
    },
    [view.x, view.y, view.w, view.h],
  );

  const zoom = useCallback(
    (factor: number, center?: Point) => {
      const c = resolveCamera(camera, plan, size);
      const s = Math.min(Math.max(c.s * factor, 0.02), 50);
      const k = s / c.s;
      const [px, py] = center ?? [c.cx, c.cy];
      setCamera({ kind: "free", cx: px + (c.cx - px) * k, cy: py + (c.cy - py) * k, s });
    },
    [camera, plan, size],
  );
  const fit = () => setCamera({ kind: "fit" });

  // Molette : zoom centré sur le curseur (listener non passif pour bloquer le défilement).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * 0.0015), toPlan(e.clientX, e.clientY));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [zoom, toPlan]);

  const unitsPerPx = view.w / size.w;
  const k = Math.min(Math.max(unitsPerPx, 0.25), 6);
  const r = 13 * k;

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    const pt = toPlan(e.clientX, e.clientY);
    const target = targetOf(e.target);
    const handled = e.button === 0 && props.onPointerDown?.(e, pt, target);
    if (handled) return;
    if (e.button === 0 || e.button === 1) {
      // La cible est mémorisée ici : avec la capture du pointeur, le relâchement vise le SVG lui-même.
      pan.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, cam: { kind: "free", ...cam }, moved: false, target };
      setPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const p = pan.current;
    if (p && p.id === e.pointerId) {
      const dx = e.clientX - p.sx;
      const dy = e.clientY - p.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) p.moved = true;
      setCamera({ ...p.cam, cx: p.cam.cx - dx * p.cam.s, cy: p.cam.cy - dy * p.cam.s });
      return;
    }
    props.onPointerMove?.(e, toPlan(e.clientX, e.clientY));
  }

  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    const p = pan.current;
    if (p && p.id === e.pointerId) {
      pan.current = null;
      setPanning(false);
      if (!p.moved && e.button === 0) {
        // Simple clic (sans déplacement de la vue)
        const target = p.target;
        if (target.kind === "device") {
          const d = devices.find((x) => x.id === target.id);
          if (d) props.onDeviceClick?.(d);
        } else if (target.kind === "zone") {
          const z = zones.find((x) => x.id === target.id);
          if (z) props.onZoneClick?.(z);
        } else props.onBackgroundClick?.();
      }
      return;
    }
    props.onPointerUp?.(e, toPlan(e.clientX, e.clientY));
  }

  const visibleZones = zones.filter((z) => z.points.length >= 3 && !hiddenZoneIds?.has(z.id));
  const placed = devices.filter((d) => d.x !== null && d.y !== null);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-slate-200">
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{ cursor: panning ? "grabbing" : props.cursor ?? "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={(e) => props.onDoubleClick?.(e, toPlan(e.clientX, e.clientY))}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#cbd5e1" strokeWidth="0.6" />
          </pattern>
          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.35" />
          </filter>
        </defs>

        <rect x={0} y={0} width={plan.width} height={plan.height} fill="#fff" stroke="#94a3b8" strokeWidth={unitsPerPx} />
        {plan.background && (
          <image href={plan.background} x={0} y={0} width={plan.width} height={plan.height} preserveAspectRatio="xMidYMid meet" opacity={0.85} />
        )}
        {showGrid && <rect x={0} y={0} width={plan.width} height={plan.height} fill="url(#grid)" pointerEvents="none" />}

        {/* Dessin : pièces, murs, textes */}
        {shapes.map((s) => {
          const sel = s.id === selectedShapeId;
          const stroke = sel ? "#2563eb" : "#334155";
          if (s.kind === "room")
            return (
              <g key={s.id} data-kind="shape" data-id={s.id}>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#f8fafc" fillOpacity={plan.background ? 0.3 : 1} stroke={stroke} strokeWidth={sel ? 5 : 4} />
                {s.label && (
                  <text x={s.x + s.w / 2} y={s.y + 22} textAnchor="middle" fontSize={16} fill="#475569" fontWeight={600}>
                    {s.label}
                  </text>
                )}
              </g>
            );
          if (s.kind === "wall")
            return (
              <polyline
                key={s.id}
                data-kind="shape"
                data-id={s.id}
                points={s.points.map((p) => p.join(",")).join(" ")}
                fill="none"
                stroke={stroke}
                strokeWidth={sel ? 8 : 6}
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            );
          return (
            <text key={s.id} data-kind="shape" data-id={s.id} x={s.x} y={s.y} fontSize={s.size} fill={sel ? "#2563eb" : "#334155"} textAnchor="middle" dominantBaseline="middle">
              {s.text}
            </text>
          );
        })}

        {/* Zones */}
        {visibleZones.map((z) => {
          const sel = z.id === selectedZoneId;
          return (
            <polygon
              key={z.id}
              data-kind="zone"
              data-id={z.id}
              points={z.points.map((p) => p.join(",")).join(" ")}
              fill={z.color}
              fillOpacity={sel ? 0.32 : 0.14}
              stroke={z.color}
              strokeWidth={(sel ? 3 : 1.6) * k}
              strokeDasharray={sel ? undefined : `${6 * k} ${4 * k}`}
              className="cursor-pointer transition-[fill-opacity] hover:fill-opacity-25"
            />
          );
        })}
        {visibleZones.map((z) => {
          const [ax, ay] = labelAnchor(z.points);
          return (
            <text
              key={`l${z.id}`}
              x={ax + 6 * k}
              y={ay + 6 * k}
              textAnchor="start"
              dominantBaseline="hanging"
              fontSize={13 * k}
              fontWeight={700}
              fill={z.color}
              stroke="#fff"
              strokeWidth={3 * k}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {z.name}
            </text>
          );
        })}

        {/* Appareils */}
        {placed.map((d) => {
          const t = deviceType(d.type);
          const hl = d.id === highlightDeviceId;
          return (
            <g key={d.id} data-kind="device" data-id={d.id} transform={`translate(${d.x} ${d.y})`} className="cursor-pointer">
              {hl && (
                <circle r={r} fill="none" stroke="#ef4444" strokeWidth={3 * k} pointerEvents="none">
                  <animate attributeName="r" from={r} to={r * 3} dur="1.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from={0.9} to={0} dur="1.4s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r={r} fill="#fff" stroke={hl ? "#ef4444" : t.color} strokeWidth={(hl ? 3.5 : 2.2) * k} filter="url(#shadow)" />
              <text fontSize={r * 1.05} textAnchor="middle" dominantBaseline="central" pointerEvents="none">
                {t.icon}
              </text>
              {(showLabels || hl) && (
                <text
                  y={r + 11 * k}
                  fontSize={11 * k}
                  textAnchor="middle"
                  fontWeight={hl ? 700 : 500}
                  fill={hl ? "#b91c1c" : "#0f172a"}
                  stroke="#fff"
                  strokeWidth={3 * k}
                  paintOrder="stroke"
                  pointerEvents="none"
                >
                  {d.name}
                </text>
              )}
            </g>
          );
        })}

        {props.overlay?.(unitsPerPx)}
      </svg>

      <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-md border border-slate-300 bg-white shadow">
        <button className="px-2.5 py-1 hover:bg-slate-100" title="Zoom avant" onClick={() => zoom(1 / 1.3)}>＋</button>
        <button className="border-y border-slate-200 px-2.5 py-1 hover:bg-slate-100" title="Zoom arrière" onClick={() => zoom(1.3)}>－</button>
        <button className="px-2.5 py-1 text-xs hover:bg-slate-100" title="Tout afficher" onClick={fit}>⤢</button>
      </div>
    </div>
  );
}
