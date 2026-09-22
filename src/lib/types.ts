// Types partagés client / serveur.

export type Point = [number, number];

export type Shape =
  | { id: string; kind: "wall"; points: Point[] }
  | { id: string; kind: "room"; x: number; y: number; w: number; h: number; label?: string }
  | { id: string; kind: "text"; x: number; y: number; text: string; size: number };

export type ZoneDTO = {
  id: number;
  planId: number;
  name: string;
  description: string | null;
  color: string;
  points: Point[];
};

export type DeviceDTO = {
  id: number;
  name: string;
  type: string;
  ip: string | null;
  mac: string | null;
  assignedUser: string | null;
  description: string | null;
  location: string | null;
  planId: number | null;
  zoneId: number | null;
  x: number | null;
  y: number | null;
  plan?: { id: number; name: string } | null;
  zone?: { id: number; name: string; color: string } | null;
};

export type PlanDTO = {
  id: number;
  name: string;
  description: string | null;
  width: number;
  height: number;
  background: string | null;
  shapes: Shape[];
};

export type DeviceType = { value: string; label: string; icon: string; color: string };

export const DEVICE_TYPES: DeviceType[] = [
  { value: "pc", label: "PC fixe", icon: "🖥️", color: "#2563eb" },
  { value: "laptop", label: "Portable", icon: "💻", color: "#0891b2" },
  { value: "server", label: "Serveur", icon: "🗄️", color: "#7c3aed" },
  { value: "switch", label: "Switch", icon: "🔀", color: "#059669" },
  { value: "router", label: "Routeur", icon: "📡", color: "#d97706" },
  { value: "box", label: "Box internet", icon: "📦", color: "#ea580c" },
  { value: "firewall", label: "Pare-feu", icon: "🛡️", color: "#dc2626" },
  { value: "access_point", label: "Borne Wi-Fi", icon: "📶", color: "#16a34a" },
  { value: "printer", label: "Imprimante", icon: "🖨️", color: "#475569" },
  { value: "phone", label: "Téléphone IP", icon: "☎️", color: "#db2777" },
  { value: "nas", label: "NAS / stockage", icon: "💾", color: "#9333ea" },
  { value: "camera", label: "Caméra", icon: "📷", color: "#0f766e" },
  { value: "other", label: "Autre", icon: "❔", color: "#6b7280" },
];

const TYPE_MAP = new Map(DEVICE_TYPES.map((t) => [t.value, t]));

export function deviceType(value: string): DeviceType {
  return TYPE_MAP.get(value) ?? TYPE_MAP.get("other")!;
}

/** Retrouve un type à partir d'un libellé libre (import Excel : "Serveur", "switch", "Box"...). */
export function normalizeDeviceType(input: string | null | undefined): string {
  if (!input) return "pc";
  const s = input
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const t of DEVICE_TYPES) {
    const label = t.label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (s === t.value || s === label) return t.value;
  }
  const aliases: [RegExp, string][] = [
    [/serv/, "server"],
    [/switch|commutateur/, "switch"],
    [/rout/, "router"],
    [/box|livebox|freebox|bbox/, "box"],
    [/firewall|pare.?feu|fw/, "firewall"],
    [/wifi|wi-fi|borne|\bap\b|access/, "access_point"],
    [/imprim|print|copieur/, "printer"],
    [/tel|phone|voip/, "phone"],
    [/nas|stockage|san/, "nas"],
    [/camera|cam/, "camera"],
    [/portable|laptop/, "laptop"],
    [/pc|poste|ordi|desktop|station/, "pc"],
  ];
  for (const [re, v] of aliases) if (re.test(s)) return v;
  return "other";
}

/** Test point dans polygone (ray casting). */
export function pointInPolygon(x: number, y: number, pts: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
