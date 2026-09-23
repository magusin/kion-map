import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { DEVICE_TYPES, normalizeDeviceType, deviceType } from "./types";
import { isValidIp } from "./validation";
import { ApiError } from "./api";

/** Colonnes du fichier (ordre du modèle) et en-têtes acceptés à l'import. */
export const COLUMNS = [
  { key: "name", header: "Nom", aliases: ["nom", "name", "hostname", "nom machine", "appareil", "equipement", "nom appareil"] },
  { key: "type", header: "Type", aliases: ["type", "categorie", "type appareil"] },
  { key: "ip", header: "IP", aliases: ["ip", "adresse ip", "ip address", "adresse"] },
  { key: "mac", header: "MAC", aliases: ["mac", "adresse mac", "mac address"] },
  { key: "assignedUser", header: "Utilisateur", aliases: ["utilisateur", "user", "assigne a", "proprietaire", "responsable", "operateur", "collaborateur", "salarie"] },
  { key: "description", header: "Description", aliases: ["description", "commentaire", "remarque", "notes"] },
  { key: "location", header: "Localisation", aliases: ["localisation", "emplacement", "location", "bureau", "lieu"] },
  { key: "plan", header: "Plan", aliases: ["plan", "etage", "batiment", "site"] },
  { key: "zone", header: "Zone", aliases: ["zone", "salle", "piece", "local"] },
] as const;

type Key = (typeof COLUMNS)[number]["key"];
type Row = Partial<Record<Key, string>>;

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\-.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("error" in value) return "";
  }
  return String(value).trim();
}

function mapHeaders(headers: string[]): Map<number, Key> {
  const map = new Map<number, Key>();
  headers.forEach((h, i) => {
    const n = norm(h);
    const col = COLUMNS.find((c) => (c.aliases as readonly string[]).includes(n));
    if (col && ![...map.values()].includes(col.key)) map.set(i, col.key);
  });
  if (![...map.values()].includes("name")) {
    throw new ApiError(400, "Colonne « Nom » introuvable dans la première ligne du fichier");
  }
  return map;
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map((r) => r.map((f) => f.trim()));
}

export async function readRows(file: File): Promise<Row[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  let table: string[][];
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") {
    table = parseCsv(buf.toString("utf8").replace(/^﻿/, ""));
  } else {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
    } catch {
      throw new ApiError(400, "Fichier illisible : utilisez un .xlsx ou un .csv");
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new ApiError(400, "Le classeur est vide");
    table = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const values: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) values.push(cellText(row.getCell(c).value));
      table[n - 1] = values;
    });
    table = Array.from(table, (r) => r ?? []);
  }
  if (table.length < 1) throw new ApiError(400, "Le fichier est vide");
  const headers = mapHeaders(table[0]);
  return table.slice(1).map((cells) => {
    const row: Row = {};
    headers.forEach((key, i) => {
      const v = (cells[i] ?? "").trim();
      if (v) row[key] = v;
    });
    return row;
  });
}

export type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  plansCreated: string[];
  zonesCreated: string[];
  errors: { row: number; message: string }[];
};

/**
 * Importe les appareils : mise à jour si le nom existe déjà, création sinon.
 * Les plans et zones inconnus sont créés (zones sans contour, à dessiner ensuite).
 */
export async function importRows(rows: Row[]): Promise<ImportReport> {
  const report: ImportReport = { created: 0, updated: 0, skipped: 0, plansCreated: [], zonesCreated: [], errors: [] };
  const planCache = new Map<string, number>();
  const zoneCache = new Map<string, number>();

  for (const p of await prisma.plan.findMany({ select: { id: true, name: true } })) planCache.set(norm(p.name), p.id);
  for (const z of await prisma.zone.findMany({ select: { id: true, name: true, planId: true } })) zoneCache.set(`${z.planId}|${norm(z.name)}`, z.id);

  for (const [i, row] of rows.entries()) {
    const line = i + 2; // ligne Excel (en-tête = 1)
    if (Object.keys(row).length === 0) continue;
    if (!row.name) {
      report.skipped++;
      report.errors.push({ row: line, message: "Nom manquant" });
      continue;
    }
    if (row.ip && !isValidIp(row.ip)) {
      report.skipped++;
      report.errors.push({ row: line, message: `IP invalide « ${row.ip} »` });
      continue;
    }
    try {
      let planId: number | null = null;
      let zoneId: number | null = null;
      if (row.plan) {
        planId = planCache.get(norm(row.plan)) ?? null;
        if (!planId) {
          planId = (await prisma.plan.create({ data: { name: row.plan.slice(0, 100) } })).id;
          planCache.set(norm(row.plan), planId);
          report.plansCreated.push(row.plan);
        }
      }
      if (row.zone && planId) {
        const k = `${planId}|${norm(row.zone)}`;
        zoneId = zoneCache.get(k) ?? null;
        if (!zoneId) {
          zoneId = (await prisma.zone.create({ data: { planId, name: row.zone.slice(0, 100), points: [] } })).id;
          zoneCache.set(k, zoneId);
          report.zonesCreated.push(`${row.plan} / ${row.zone}`);
        }
      } else if (row.zone && !planId) {
        report.errors.push({ row: line, message: `Zone « ${row.zone} » ignorée : aucun plan indiqué` });
      }

      const data = {
        type: normalizeDeviceType(row.type),
        ip: row.ip ?? null,
        mac: row.mac ?? null,
        assignedUser: row.assignedUser ?? null,
        description: row.description ?? null,
        location: row.location ?? null,
      };
      const name = row.name.slice(0, 100);
      const existing = await prisma.device.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
      if (existing) {
        // Même plan : on garde la position ; zone reprise du fichier seulement si l'appareil n'est pas positionné.
        const samePlan = existing.planId === planId;
        const positioned = samePlan && existing.x !== null;
        await prisma.device.update({
          where: { id: existing.id },
          data: {
            ...data,
            planId,
            zoneId: positioned ? existing.zoneId : zoneId,
            x: samePlan ? existing.x : null,
            y: samePlan ? existing.y : null,
          },
        });
        report.updated++;
      } else {
        await prisma.device.create({ data: { ...data, name, planId, zoneId } });
        report.created++;
      }
    } catch (err) {
      report.skipped++;
      report.errors.push({ row: line, message: err instanceof Error ? err.message : "Erreur inconnue" });
    }
  }
  return report;
}

// ---------------------------------------------------------------------------
// Modèle d'import et export : même mise en forme, pour pouvoir réimporter un export.
// Format documenté dans docs/import-excel.md.

const FONT = "Arial";
const BLUE = "FF1E40AF";
const RED = "FFB91C1C";
const LAST_ROW = 1000; // lignes équipées des listes déroulantes et contrôles

/** Aide affichée dans Excel quand on sélectionne une cellule de la colonne (255 caractères max). */
const HELP: Record<Key, { width: number; max: number; prompt: string }> = {
  name: { width: 20, max: 100, prompt: "OBLIGATOIRE et UNIQUE (hostname). Un nom déjà présent dans Kion Map met l'appareil à jour au lieu d'en créer un nouveau." },
  type: { width: 18, max: 30, prompt: "Choisir dans la liste déroulante (onglet Listes)." },
  ip: { width: 16, max: 64, prompt: "IPv4 (ex. 10.0.20.21) ou IPv6. Facultatif. Une IP invalide fait ignorer la ligne." },
  mac: { width: 20, max: 64, prompt: "Format 00:1A:2B:3C:4D:5E. Facultatif." },
  assignedUser: { width: 24, max: 100, prompt: "Prénom Nom (ou service pour un équipement partagé, ex. Service IT). Toujours la même orthographe : ce nom regroupe les postes de la personne (onglet Opérateurs)." },
  description: { width: 42, max: 2000, prompt: "Texte libre : modèle, rôle, remarques…" },
  location: { width: 28, max: 200, prompt: "Précision libre : bureau, baie, étage… (ex. Bureau 12, Baie A - U12)." },
  plan: { width: 14, max: 100, prompt: "Nom exact du plan (ex. RDC, 1er étage). Créé automatiquement s'il n'existe pas." },
  zone: { width: 24, max: 100, prompt: "Nom exact de la zone dans ce plan (ex. Comptabilité). Créée si besoin (contour à dessiner ensuite). Nécessite la colonne Plan." },
};

const TYPE_EXAMPLES: Record<string, string> = {
  pc: "Poste de bureau",
  laptop: "Ordinateur portable",
  server: "Serveur physique ou virtuel",
  switch: "Switch réseau",
  router: "Routeur",
  box: "Box opérateur (fibre, ADSL)",
  firewall: "Pare-feu",
  access_point: "Point d'accès Wi-Fi",
  printer: "Imprimante, copieur, traceur",
  phone: "Téléphone IP",
  nas: "NAS, stockage, enregistreur vidéo",
  camera: "Caméra IP",
  other: "Visio, vidéoprojecteur, contrôleur…",
};

type Values = Partial<Record<Key, string | null | undefined>>;

/** Onglet « Appareils » : en-têtes, formats, listes déroulantes, contrôles et aides. */
function devicesSheet(wb: ExcelJS.Workbook, rows: Values[]) {
  const ws = wb.addWorksheet("Appareils", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: HELP[c.key].width }));
  ws.getRow(1).height = 22;
  ws.getRow(1).eachCell((cell, col) => {
    cell.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: col === 1 ? RED : BLUE } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.addRows(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v || null]))));

  const lastRow = Math.max(LAST_ROW, rows.length + 100);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastRow, column: COLUMNS.length } };
  const typeList = `Listes!$A$2:$A$${DEVICE_TYPES.length + 1}`;
  for (let r = 2; r <= lastRow; r++) {
    const row = ws.getRow(r);
    COLUMNS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.font = { name: FONT };
      // IP et MAC en texte : Excel ne les transforme pas en nombres ou en dates.
      if (c.key === "ip" || c.key === "mac") cell.numFmt = "@";
      const help = HELP[c.key];
      const base = { allowBlank: true, showInputMessage: true, promptTitle: c.header, prompt: help.prompt, showErrorMessage: true };
      if (c.key === "type") {
        cell.dataValidation = { ...base, type: "list", formulae: [typeList], errorTitle: "Type inconnu", error: "Choisissez un type dans la liste (onglet Listes)." };
      } else if (c.key === "name") {
        cell.dataValidation = { ...base, promptTitle: "Nom (obligatoire)", type: "custom", formulae: [`COUNTIF($A$2:$A$${lastRow},A${r})=1`], errorTitle: "Nom en double", error: "Ce nom existe déjà dans le fichier : chaque appareil doit avoir un nom unique." };
      } else if (c.key === "zone") {
        cell.dataValidation = { ...base, type: "custom", formulae: [`OR(I${r}="",H${r}<>"")`], errorStyle: "warning", errorTitle: "Plan manquant", error: "Une zone doit être accompagnée d'un plan (colonne Plan)." };
      } else {
        cell.dataValidation = { ...base, type: "textLength", operator: "lessThanOrEqual", formulae: [help.max], errorTitle: "Texte trop long", error: `${help.max} caractères maximum.` };
      }
    });
  }
  return ws;
}

function listsSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("Listes");
  ws.columns = [
    { header: "Type (valeur à utiliser)", width: 26 },
    { header: "Exemples d'appareils", width: 44 },
  ];
  ws.getRow(1).eachCell((cell) => {
    cell.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
  });
  for (const t of DEVICE_TYPES) {
    const row = ws.addRow([t.label, TYPE_EXAMPLES[t.value] ?? ""]);
    row.getCell(1).font = { name: FONT };
    row.getCell(2).font = { name: FONT, color: { argb: "FF475569" } };
  }
}

function guideSheet(wb: ExcelJS.Workbook, withExamples: boolean) {
  const ws = wb.addWorksheet("Mode d'emploi");
  ws.columns = [{ width: 4 }, { width: 22 }, { width: 100 }];
  ws.getCell("B1").value = "Kion Map – import des appareils";
  ws.getCell("B1").font = { name: FONT, bold: true, size: 14, color: { argb: BLUE } };
  const lines: [string, string, string][] = [
    ["1", "Remplir", "Complétez l'onglet « Appareils » : une ligne par appareil. Seule la colonne Nom (en rouge) est obligatoire."],
    ...(withExamples
      ? ([["2", "Exemples", "Les lignes 2 à 9 sont des EXEMPLES : supprimez-les ou remplacez-les par vos données avant l'import."]] as [string, string, string][])
      : []),
    [withExamples ? "3" : "2", "Importer", "Dans Kion Map : Appareils → ⬆ Import Excel → choisir ce fichier → Importer (compte Modérateur ou Super admin)."],
    [withExamples ? "4" : "3", "Vérifier", "Lisez le rapport : créés / mis à jour / ignorés (avec le numéro de ligne et la raison)."],
    [withExamples ? "5" : "4", "Placer", "Plans → ✏️ : dessinez le contour des zones créées (onglet Zones → Dessiner), puis placez les appareils (onglet Appareils → Placer)."],
    ["", "", ""],
    ["", "Règles importantes", ""],
    ["•", "Première feuille", "Seul le PREMIER onglet est lu, et la ligne 1 doit rester la ligne d'en-têtes. Ne renommez pas les colonnes."],
    ["•", "Nom unique", "Un nom déjà présent met à jour l'appareil (sa position sur le plan est conservée s'il reste sur le même plan). Majuscules ignorées : « pc-achats-01 » = « PC-ACHATS-01 »."],
    ["•", "Type", "Utilisez la liste déroulante. Un libellé proche est aussi compris (Poste, Livebox, Copieur, Wifi…) ; sinon le type devient « Autre »."],
    ["•", "IP", "Une IP invalide (ex. 10.0.300.1) fait ignorer toute la ligne. Laissez vide si inconnue."],
    ["•", "Utilisateur", "Toujours la même orthographe (Prénom Nom) : c'est ce qui regroupe les postes d'une personne dans l'onglet Opérateurs. Équipement partagé : le service (ex. Service IT)."],
    ["•", "Plan / Zone", "Noms exacts, comme dans l'application. Un plan ou une zone inconnus sont créés automatiquement ; une zone sans plan est ignorée."],
    ["•", "Lignes vides", "Ignorées ; une ligne sans Nom est signalée dans le rapport."],
    ["•", "Taille", "4 Mo maximum (plusieurs milliers d'appareils)."],
    ["•", "Mise à jour", "Appareils → ⬇ Export Excel, corrigez, puis réimportez. Supprimer une ligne du fichier ne supprime pas l'appareil."],
  ];
  lines.forEach(([n, a, b], i) => {
    const row = ws.getRow(i + 3);
    row.getCell(1).value = n;
    row.getCell(1).font = { name: FONT, bold: true, color: { argb: BLUE } };
    row.getCell(2).value = a;
    row.getCell(2).font = { name: FONT, bold: true, size: a === "Règles importantes" ? 12 : 10 };
    row.getCell(3).value = b;
    row.getCell(3).font = { name: FONT };
    row.getCell(3).alignment = { wrapText: true, vertical: "top" };
    row.getCell(2).alignment = { vertical: "top" };
  });
}

/** Exemples du modèle : un service complet (poste, téléphone, portable, imprimante) + infrastructure. */
const TEMPLATE_EXAMPLES: Values[] = [
  { name: "PC-ACHATS-01", type: "PC fixe", ip: "10.0.20.31", mac: "00:1A:3F:22:8B:01", assignedUser: "Claire Martin", description: "Dell OptiPlex 7010 – poste achats", location: "Bureau 14", plan: "1er étage", zone: "Achats" },
  { name: "TEL-ACHATS-01", type: "Téléphone IP", ip: "10.0.20.131", mac: "00:1A:3F:22:8B:02", assignedUser: "Claire Martin", description: "Yealink T54W", location: "Bureau 14", plan: "1er étage", zone: "Achats" },
  { name: "LT-ACHATS-02", type: "Portable", ip: "10.0.20.32", mac: "00:1A:3F:22:8B:03", assignedUser: "Paul Renard", description: "Lenovo ThinkPad T14 – télétravail", location: "Bureau 15", plan: "1er étage", zone: "Achats" },
  { name: "IMP-ACHATS", type: "Imprimante", ip: "10.0.20.85", mac: "00:1A:3F:22:8B:04", assignedUser: "Service achats", description: "HP LaserJet M507 – partagée", location: "Couloir 1er", plan: "1er étage", zone: "Achats" },
  { name: "SRV-GED", type: "Serveur", ip: "10.0.1.40", mac: "00:1A:3F:22:8B:05", assignedUser: "Service IT", description: "Serveur GED (VM), sauvegardé chaque nuit", location: "Salle serveur - Baie B U20", plan: "RDC", zone: "Baie B (serveurs)" },
  { name: "SW-ETAGE1-02", type: "Switch", ip: "10.0.0.14", mac: "00:1A:3F:22:8B:06", assignedUser: "Service IT", description: "Switch 24 ports PoE", location: "Local reprographie - baie U18", plan: "1er étage", zone: "Local reprographie" },
  { name: "AP-1-ACHATS", type: "Borne Wi-Fi", ip: "10.0.0.54", mac: "00:1A:3F:22:8B:07", assignedUser: "Service IT", description: "Borne plafond Wi-Fi 6", location: "Achats - plafond", plan: "1er étage", zone: "Achats" },
  { name: "LT-STOCK-10", type: "Portable", mac: "00:1A:3F:22:8B:08", description: "Portable neuf en stock, non attribué", location: "Armoire IT" },
];

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  devicesSheet(wb, TEMPLATE_EXAMPLES);
  guideSheet(wb, true);
  listsSheet(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildExport(): Promise<Buffer> {
  const devices = await prisma.device.findMany({
    orderBy: { name: "asc" },
    include: { plan: { select: { name: true } }, zone: { select: { name: true } } },
  });
  const wb = new ExcelJS.Workbook();
  // Même format que le modèle : l'export peut être corrigé puis réimporté tel quel.
  devicesSheet(
    wb,
    devices.map((d) => ({
      name: d.name,
      type: deviceType(d.type).label,
      ip: d.ip,
      mac: d.mac,
      assignedUser: d.assignedUser,
      description: d.description,
      location: d.location,
      plan: d.plan?.name,
      zone: d.zone?.name,
    })),
  );
  guideSheet(wb, false);
  listsSheet(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
