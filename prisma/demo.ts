// Jeu de données de démonstration : 3 plans (RDC, 1er et 2e étage) dessinés avec leurs
// pièces, une zone par pièce (et des sous-zones pour les baies), et ~130 appareils placés.
// Idempotent : un plan ou un appareil dont le nom existe déjà n'est pas recréé.
import type { PrismaClient } from "../src/generated/prisma/client";

type Pt = [number, number];
type Room = { name: string; x: number; y: number; w: number; h: number; color: string; description?: string };
type Dev = {
  name: string;
  type: string;
  ip: string;
  assignedUser?: string;
  description?: string;
  location?: string;
  x: number;
  y: number;
};
type Sub = { name: string; x: number; y: number; w: number; h: number; color: string; description?: string };
type Floor = {
  name: string;
  description: string;
  rooms: Room[];
  subZones?: Sub[];
  texts: { x: number; y: number; text: string; size?: number }[];
  devices: Dev[];
};

// Générateur pseudo-aléatoire déterministe : mêmes données à chaque exécution.
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const mac = () =>
  ["00", "1A", ...Array.from({ length: 4 }, () => Math.floor(rand() * 256).toString(16).padStart(2, "0").toUpperCase())].join(":");

const rect = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** Répartit n postes en grille dans une pièce (marge intérieure). */
function desks(room: Room, n: number, cols: number): Pt[] {
  const rows = Math.ceil(n / cols);
  const pad = 45;
  const top = 70; // sous le nom de la zone
  const bottom = 90; // place pour le téléphone et les libellés
  const dx = (room.w - 2 * pad) / Math.max(cols - 1, 1);
  const dy = (room.h - top - bottom) / Math.max(rows - 1, 1);
  return Array.from({ length: n }, (_, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    return [Math.round(room.x + pad + (cols === 1 ? (room.w - 2 * pad) / 2 : c * dx)), Math.round(room.y + top + (rows === 1 ? 0 : r * dy))];
  });
}

const PEOPLE = [
  "Marie Dupont", "Jean Martin", "Sophie Bernard", "Lucas Petit", "Camille Durand", "Thomas Leroy",
  "Julie Moreau", "Nicolas Simon", "Emma Laurent", "Hugo Lefebvre", "Chloé Michel", "Antoine Garcia",
  "Léa David", "Maxime Bertrand", "Manon Roux", "Alexandre Vincent", "Sarah Fournier", "Pierre Morel",
  "Laura Girard", "Julien André", "Inès Mercier", "Romain Blanc", "Clara Guerin", "Mathieu Boyer",
  "Océane Garnier", "Kevin Chevalier", "Pauline François", "Quentin Legrand", "Anaïs Gauthier", "Benoît Perrin",
  "Élodie Robin", "Florian Clément", "Mélanie Morin", "Adrien Nicolas", "Justine Henry", "Sébastien Roussel",
  "Aurélie Mathieu", "Guillaume Masson", "Nathalie Lambert", "Vincent Faure", "Céline Rousseau", "Damien Bonnet",
  "Sandrine Dumas", "Olivier Fontaine", "Émilie Lemaire", "Jérôme Barbier", "Caroline Meunier", "François Brun",
  "Isabelle Schmitt", "Arnaud Colin", "Virginie Picard", "Cédric Renaud",
];
let person = 0;
// Une personne = un seul bureau (la liste couvre tous les postes nominatifs de la démo).
const nextPerson = () => PEOPLE[person++] ?? `Collaborateur ${person}`;

/** Postes de travail : PC (+ téléphone IP un poste sur deux). */
function workstations(room: Room, prefix: string, service: string, n: number, cols: number, subnet: string, start: number, laptops = 0, shared?: string): Dev[] {
  const out: Dev[] = [];
  desks(room, n, cols).forEach(([x, y], i) => {
    // Postes partagés (salle de formation) : pas d'utilisateur nominatif
    const user = shared ?? nextPerson();
    const num = String(i + 1).padStart(2, "0");
    const laptop = i < laptops;
    out.push({
      name: `${laptop ? "LT" : "PC"}-${prefix}-${num}`,
      type: laptop ? "laptop" : "pc",
      ip: `${subnet}.${start + i}`,
      assignedUser: user,
      description: `${laptop ? "Portable" : "Poste fixe"} ${service}`,
      location: `${room.name} - bureau ${num}`,
      x,
      y,
    });
    if (i % 2 === 0) {
      out.push({
        name: `TEL-${prefix}-${num}`,
        type: "phone",
        ip: `${subnet}.${start + 100 + i}`,
        assignedUser: user,
        description: "Téléphone IP",
        location: `${room.name} - bureau ${num}`,
        x,
        y: y + 46,
      });
    }
  });
  return out;
}

function floors(): Floor[] {
  person = 0; // mêmes attributions à chaque appel
  // ---------------- RDC ----------------
  const accueil: Room = { name: "Accueil", x: 40, y: 40, w: 340, h: 280, color: "#0ea5e9", description: "Hall d'entrée et banque d'accueil" };
  const serveur: Room = { name: "Salle serveur", x: 380, y: 40, w: 320, h: 280, color: "#7c3aed", description: "Accès restreint, climatisée" };
  const technique: Room = { name: "Local technique", x: 700, y: 40, w: 200, h: 280, color: "#64748b", description: "Arrivée opérateur, baie de brassage RDC" };
  const reunionRdc: Room = { name: "Salle de réunion Atlas", x: 900, y: 40, w: 260, h: 280, color: "#f59e0b", description: "12 places, écran et visioconférence" };
  const commercial: Room = { name: "Open space Commercial", x: 40, y: 420, w: 660, h: 340, color: "#10b981", description: "Équipe commerciale" };
  const support: Room = { name: "Support client", x: 700, y: 420, w: 460, h: 340, color: "#ec4899", description: "Hotline et SAV" };

  const rdc: Floor = {
    name: "RDC",
    description: "Rez-de-chaussée : accueil, salle serveur, commercial et support",
    rooms: [accueil, serveur, technique, reunionRdc, commercial, support],
    subZones: [
      { name: "Baie A (réseau)", x: 400, y: 75, w: 135, h: 230, color: "#a855f7", description: "Cœur de réseau et sécurité" },
      { name: "Baie B (serveurs)", x: 545, y: 75, w: 140, h: 230, color: "#6d28d9", description: "Serveurs et stockage" },
    ],
    texts: [
      { x: 210, y: 790, text: "▲ Entrée principale", size: 18 },
      { x: 600, y: 370, text: "Couloir", size: 16 },
    ],
    devices: [
      // Local technique : arrivée internet
      { name: "BOX-FIBRE", type: "box", ip: "10.0.0.254", description: "Box fibre opérateur (1 Gb/s)", location: "Local technique - mur", x: 750, y: 120 },
      { name: "RTR-EDGE", type: "router", ip: "10.0.0.253", description: "Routeur de bordure, lien de secours 4G", location: "Local technique - baie", x: 850, y: 120 },
      { name: "SW-RDC-01", type: "switch", ip: "10.0.0.11", description: "Switch d'étage RDC 48 ports PoE", location: "Local technique - baie U20", x: 800, y: 230 },
      // Baie A : réseau
      { name: "FW-01", type: "firewall", ip: "10.0.0.1", description: "Pare-feu principal (passerelle)", location: "Salle serveur - Baie A U40", x: 435, y: 125 },
      { name: "SW-CORE-01", type: "switch", ip: "10.0.0.2", description: "Switch cœur de réseau 10 Gb/s", location: "Salle serveur - Baie A U38", x: 500, y: 125 },
      { name: "SW-CORE-02", type: "switch", ip: "10.0.0.3", description: "Switch cœur (redondance)", location: "Salle serveur - Baie A U36", x: 435, y: 215 },
      { name: "WLC-01", type: "other", ip: "10.0.0.5", description: "Contrôleur Wi-Fi", location: "Salle serveur - Baie A U30", x: 500, y: 215 },
      // Baie B : serveurs
      { name: "SRV-AD01", type: "server", ip: "10.0.1.10", assignedUser: "Service IT", description: "Contrôleur de domaine principal, DNS, DHCP", location: "Salle serveur - Baie B U12", x: 580, y: 125 },
      { name: "SRV-AD02", type: "server", ip: "10.0.1.11", assignedUser: "Service IT", description: "Contrôleur de domaine secondaire", location: "Salle serveur - Baie B U14", x: 650, y: 125 },
      { name: "SRV-FILES", type: "server", ip: "10.0.1.20", assignedUser: "Service IT", description: "Serveur de fichiers", location: "Salle serveur - Baie B U16", x: 580, y: 195 },
      { name: "SRV-ERP", type: "server", ip: "10.0.1.30", assignedUser: "Service IT", description: "ERP et base de données", location: "Salle serveur - Baie B U18", x: 650, y: 195 },
      { name: "NAS-BACKUP", type: "nas", ip: "10.0.1.50", assignedUser: "Service IT", description: "Sauvegardes quotidiennes (rétention 30 j)", location: "Salle serveur - Baie B U4", x: 615, y: 260 },
      // Accueil
      { name: "PC-ACCUEIL-01", type: "pc", ip: "10.0.10.21", assignedUser: "Accueil", description: "Poste d'accueil", location: "Banque d'accueil", x: 110, y: 130 },
      { name: "TEL-ACCUEIL-01", type: "phone", ip: "10.0.10.121", assignedUser: "Accueil", description: "Standard téléphonique", location: "Banque d'accueil", x: 110, y: 176 },
      { name: "IMP-ACCUEIL", type: "printer", ip: "10.0.10.80", description: "Imprimante badges visiteurs", location: "Banque d'accueil", x: 220, y: 130 },
      { name: "CAM-ENTREE", type: "camera", ip: "10.0.50.11", description: "Caméra hall d'entrée", location: "Hall - plafond", x: 330, y: 270 },
      { name: "AP-RDC-ACCUEIL", type: "access_point", ip: "10.0.0.41", description: "Borne Wi-Fi invités", location: "Hall - plafond", x: 210, y: 240 },
      // Réunion
      { name: "VISIO-ATLAS", type: "other", ip: "10.0.10.90", description: "Système de visioconférence", location: "Salle Atlas - écran", x: 1030, y: 120 },
      { name: "AP-RDC-ATLAS", type: "access_point", ip: "10.0.0.42", description: "Borne Wi-Fi", location: "Salle Atlas - plafond", x: 1030, y: 250 },
      // Commercial
      ...workstations(commercial, "COM", "commercial", 10, 5, "10.0.10", 31, 3),
      { name: "IMP-RDC-COM", type: "printer", ip: "10.0.10.81", description: "Multifonction couleur A3", location: "Open space Commercial - fond", x: 650, y: 600 },
      { name: "AP-RDC-COM", type: "access_point", ip: "10.0.0.43", description: "Borne Wi-Fi", location: "Open space Commercial - plafond", x: 370, y: 600 },
      // Support
      ...workstations(support, "SUP", "support client", 6, 3, "10.0.10", 51),
      { name: "AP-RDC-SUP", type: "access_point", ip: "10.0.0.44", description: "Borne Wi-Fi", location: "Support client - plafond", x: 930, y: 600 },
      { name: "CAM-SUPPORT", type: "camera", ip: "10.0.50.12", description: "Caméra issue de secours", location: "Support client - issue de secours", x: 1130, y: 600 },
    ],
  };

  // ---------------- 1er étage ----------------
  const compta: Room = { name: "Comptabilité", x: 40, y: 40, w: 420, h: 330, color: "#3b82f6", description: "Service comptable et paie" };
  const rh: Room = { name: "Ressources humaines", x: 460, y: 40, w: 300, h: 330, color: "#f97316", description: "RH, bureaux fermés" };
  const reuni1: Room = { name: "Salle de réunion Orion", x: 760, y: 40, w: 400, h: 330, color: "#f59e0b", description: "8 places" };
  const it: Room = { name: "Open space IT", x: 40, y: 450, w: 620, h: 310, color: "#14b8a6", description: "Développement et support informatique" };
  const repro: Room = { name: "Local reprographie", x: 660, y: 450, w: 200, h: 310, color: "#64748b", description: "Imprimantes, baie d'étage" };
  const pause: Room = { name: "Salle de pause", x: 860, y: 450, w: 300, h: 310, color: "#84cc16", description: "Cuisine et détente" };

  const etage1: Floor = {
    name: "1er étage",
    description: "Comptabilité, RH et équipe informatique",
    rooms: [compta, rh, reuni1, it, repro, pause],
    texts: [
      { x: 600, y: 410, text: "Couloir", size: 16 },
      { x: 1100, y: 410, text: "Escalier ▼", size: 14 },
    ],
    devices: [
      ...workstations(compta, "COMPTA", "comptabilité", 6, 3, "10.0.20", 21),
      ...workstations(rh, "RH", "ressources humaines", 4, 2, "10.0.20", 41),
      { name: "VISIO-ORION", type: "other", ip: "10.0.20.90", description: "Écran interactif", location: "Salle Orion - mur", x: 960, y: 130 },
      { name: "AP-1-ORION", type: "access_point", ip: "10.0.0.51", description: "Borne Wi-Fi", location: "Salle Orion - plafond", x: 960, y: 280 },
      ...workstations(it, "IT", "informatique", 8, 4, "10.0.20", 61, 4),
      { name: "SRV-TEST", type: "server", ip: "10.0.1.60", assignedUser: "Service IT", description: "Serveur de tests / préproduction", location: "Open space IT - armoire", x: 610, y: 620 },
      { name: "AP-1-IT", type: "access_point", ip: "10.0.0.52", description: "Borne Wi-Fi", location: "Open space IT - plafond", x: 350, y: 600 },
      { name: "SW-ETAGE1-01", type: "switch", ip: "10.0.0.12", description: "Switch d'étage 48 ports PoE", location: "Local reprographie - baie U20", x: 760, y: 540 },
      { name: "IMP-1-COPIEUR", type: "printer", ip: "10.0.20.80", description: "Copieur multifonction A3", location: "Local reprographie", x: 710, y: 680 },
      { name: "IMP-1-COMPTA", type: "printer", ip: "10.0.20.81", description: "Imprimante chèques et factures", location: "Local reprographie", x: 810, y: 680 },
      { name: "AP-1-PAUSE", type: "access_point", ip: "10.0.0.53", description: "Borne Wi-Fi", location: "Salle de pause - plafond", x: 1010, y: 600 },
    ],
  };

  // ---------------- 2e étage ----------------
  const direction: Room = { name: "Direction générale", x: 40, y: 40, w: 380, h: 330, color: "#ef4444", description: "Bureaux de la direction" };
  const juridique: Room = { name: "Juridique", x: 420, y: 40, w: 300, h: 330, color: "#8b5cf6", description: "Service juridique et achats" };
  const formation: Room = { name: "Salle de formation", x: 720, y: 40, w: 440, h: 330, color: "#06b6d4", description: "16 places, postes en libre-service" };
  const marketing: Room = { name: "Open space Marketing", x: 40, y: 450, w: 760, h: 310, color: "#d946ef", description: "Marketing et communication" };
  const tech2: Room = { name: "Local technique 2e", x: 800, y: 450, w: 360, h: 310, color: "#64748b", description: "Baie d'étage et vidéosurveillance" };

  const etage2: Floor = {
    name: "2e étage",
    description: "Direction, juridique, formation et marketing",
    rooms: [direction, juridique, formation, marketing, tech2],
    texts: [{ x: 600, y: 410, text: "Couloir", size: 16 }],
    devices: [
      ...workstations(direction, "DIR", "direction", 3, 3, "10.0.30", 21, 2),
      { name: "IMP-DIR", type: "printer", ip: "10.0.30.82", description: "Imprimante confidentielle (badge)", location: "Direction - secrétariat", x: 370, y: 300 },
      ...workstations(juridique, "JUR", "juridique", 4, 2, "10.0.30", 31),
      ...workstations(formation, "FORM", "salle de formation", 8, 4, "10.0.30", 41, 0, "Salle de formation (libre-service)"),
      { name: "VIDEOPROJ-FORM", type: "other", ip: "10.0.30.90", description: "Vidéoprojecteur", location: "Salle de formation - plafond", x: 880, y: 225 },
      ...workstations(marketing, "MKT", "marketing", 8, 4, "10.0.30", 61, 2),
      { name: "IMP-2-MKT", type: "printer", ip: "10.0.30.80", description: "Traceur grand format", location: "Open space Marketing", x: 760, y: 620 },
      { name: "AP-2-MKT", type: "access_point", ip: "10.0.0.61", description: "Borne Wi-Fi", location: "Open space Marketing - plafond", x: 420, y: 600 },
      { name: "AP-2-FORM", type: "access_point", ip: "10.0.0.62", description: "Borne Wi-Fi", location: "Salle de formation - plafond", x: 1000, y: 225 },
      { name: "SW-ETAGE2-01", type: "switch", ip: "10.0.0.13", description: "Switch d'étage 48 ports PoE", location: "Local technique 2e - baie U20", x: 880, y: 540 },
      { name: "NVR-01", type: "nas", ip: "10.0.50.2", description: "Enregistreur vidéosurveillance (30 j)", location: "Local technique 2e - baie U10", x: 980, y: 540 },
      { name: "CAM-PARKING", type: "camera", ip: "10.0.50.13", description: "Caméra parking (vue depuis la façade)", location: "Façade nord", x: 1100, y: 680 },
    ],
  };

  return [rdc, etage1, etage2];
}

/** Appareils en stock, rattachés à aucun plan : pour tester le placement. */
const STOCK: Omit<Dev, "x" | "y">[] = [
  { name: "LT-STOCK-01", type: "laptop", ip: "10.0.20.201", description: "Portable de prêt", location: "Armoire IT" },
  { name: "LT-STOCK-02", type: "laptop", ip: "10.0.20.202", description: "Portable de prêt", location: "Armoire IT" },
  { name: "PC-NOUVEL-ARRIVANT", type: "pc", ip: "10.0.10.99", assignedUser: "Nouvel arrivant", description: "Poste préparé, à installer" },
  { name: "AP-SPARE", type: "access_point", description: "Borne Wi-Fi de rechange", location: "Armoire IT" } as Omit<Dev, "x" | "y">,
];

/** Responsable des équipements partagés (imprimantes, réseau, caméras…). */
const OWNERS: Record<string, string> = {
  "IMP-ACCUEIL": "Accueil",
  "IMP-RDC-COM": "Service commercial",
  "IMP-1-COPIEUR": "Services généraux",
  "IMP-1-COMPTA": "Service comptabilité",
  "IMP-DIR": "Direction générale",
  "IMP-2-MKT": "Service marketing",
  "NVR-01": "Services généraux",
  "VISIO-ATLAS": "Services généraux",
  "VISIO-ORION": "Services généraux",
  "VIDEOPROJ-FORM": "Services généraux",
};
function owner(d: { name: string; type: string; assignedUser?: string }): string | undefined {
  if (d.assignedUser) return d.assignedUser;
  if (OWNERS[d.name]) return OWNERS[d.name];
  if (d.type === "camera") return "Services généraux";
  if (["firewall", "router", "switch", "box", "server", "nas", "access_point", "other"].includes(d.type)) return "Service IT";
  return undefined; // appareils en stock : pas encore attribués
}

/** Crée l'appareil, ou complète l'utilisateur d'un appareil de démo déjà présent. */
async function upsertDevice(prisma: PrismaClient, data: Parameters<PrismaClient["device"]["create"]>[0]["data"]): Promise<boolean> {
  const existing = await prisma.device.findFirst({ where: { name: { equals: data.name, mode: "insensitive" } } });
  if (!existing) {
    await prisma.device.create({ data });
    return true;
  }
  if (!existing.assignedUser && data.assignedUser) {
    await prisma.device.update({ where: { id: existing.id }, data: { assignedUser: data.assignedUser } });
  }
  return false;
}

/**
 * Supprime uniquement les données de démonstration (plans et appareils portant les noms de la démo),
 * pour les recréer à jour. Les autres données ne sont pas touchées.
 */
export async function resetDemo(prisma: PrismaClient) {
  const fl = floors();
  const names = [...fl.flatMap((f) => f.devices.map((d) => d.name)), ...STOCK.map((d) => d.name)];
  const devices = await prisma.device.deleteMany({ where: { name: { in: names } } });
  const plans = await prisma.plan.deleteMany({ where: { name: { in: fl.map((f) => f.name) } } });
  console.log(`Démo : ${plans.count} plan(s) et ${devices.count} appareil(s) de démonstration supprimés.`);
}

export async function seedDemo(prisma: PrismaClient) {
  let plans = 0;
  let devices = 0;
  for (const f of floors()) {
    const exists = await prisma.plan.findFirst({ where: { name: { equals: f.name, mode: "insensitive" } } });
    if (exists) {
      // Plan déjà là : on complète seulement les utilisateurs manquants de ses appareils.
      for (const d of f.devices) await upsertDevice(prisma, { ...d, assignedUser: owner(d), planId: exists.id });
      console.log(`Démo : le plan « ${f.name} » existe déjà, utilisateurs manquants complétés.`);
      continue;
    }
    const shapes = [
      { id: "outer", kind: "wall", points: [[30, 30], [1170, 30], [1170, 770], [30, 770], [30, 30]] },
      ...f.rooms.map((r, i) => ({ id: `room${i}`, kind: "room", x: r.x, y: r.y, w: r.w, h: r.h })),
      ...f.texts.map((t, i) => ({ id: `text${i}`, kind: "text", x: t.x, y: t.y, text: t.text, size: t.size ?? 16 })),
    ];
    const plan = await prisma.plan.create({ data: { name: f.name, description: f.description, width: 1200, height: 800, shapes } });
    plans++;

    // Une zone par pièce (légèrement en retrait des murs) + sous-zones.
    const zones: { id: number; pts: Pt[]; area: number }[] = [];
    for (const r of f.rooms) {
      const pts = rect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      const z = await prisma.zone.create({ data: { planId: plan.id, name: r.name, description: r.description, color: r.color, points: pts } });
      zones.push({ id: z.id, pts, area: r.w * r.h });
    }
    for (const s of f.subZones ?? []) {
      const pts = rect(s.x, s.y, s.w, s.h);
      const z = await prisma.zone.create({ data: { planId: plan.id, name: s.name, description: s.description, color: s.color, points: pts } });
      zones.push({ id: z.id, pts, area: s.w * s.h });
    }
    // Zone la plus petite contenant l'appareil (même règle que l'application).
    const zoneAt = (x: number, y: number) =>
      zones
        .filter(({ pts }) => x >= pts[0][0] && x <= pts[1][0] && y >= pts[0][1] && y <= pts[2][1])
        .sort((a, b) => a.area - b.area)[0]?.id ?? null;

    for (const d of f.devices) {
      if (await upsertDevice(prisma, { ...d, assignedUser: owner(d), mac: mac(), planId: plan.id, zoneId: zoneAt(d.x, d.y) })) devices++;
    }
  }
  for (const d of STOCK) {
    if (await upsertDevice(prisma, { ...d, mac: mac() })) devices++;
  }
  console.log(`Démo : ${plans} plan(s) et ${devices} appareil(s) ajoutés.`);
}
