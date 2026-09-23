import "server-only";
import ExcelJS from "exceljs";
import { prisma } from "./prisma";
import { normalizeDeviceType, deviceType } from "./types";
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

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.key === "description" ? 40 : 20 }));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Appareils");
  styleHeader(ws);
  ws.addRows([
    { name: "SRV-AD01", type: "Serveur", ip: "192.168.1.10", mac: "00:1A:2B:3C:4D:5E", assignedUser: "Service IT", description: "Contrôleur de domaine", location: "Baie A - U12", plan: "RDC", zone: "Salle serveur" },
    { name: "SW-CORE", type: "Switch", ip: "192.168.1.2", assignedUser: "Service IT", description: "Switch cœur 48 ports", location: "Baie A - U40", plan: "RDC", zone: "Salle serveur" },
    { name: "BOX-FIBRE", type: "Box", ip: "192.168.1.1", description: "Box opérateur", location: "Local technique", plan: "RDC", zone: "Salle serveur" },
    { name: "PC-COMPTA-01", type: "PC", ip: "192.168.1.51", assignedUser: "Marie Dupont", description: "Poste comptabilité", location: "Bureau 12", plan: "1er étage", zone: "Comptabilité" },
  ]);
  const help = wb.addWorksheet("Aide");
  help.columns = [{ header: "Colonne", width: 16 }, { header: "Contenu", width: 90 }];
  help.getRow(1).font = { bold: true };
  help.addRows([
    ["Nom", "Obligatoire et unique. Un nom déjà connu met l'appareil à jour."],
    ["Type", `Un parmi : ${["pc", "laptop", "server", "switch", "router", "box", "firewall", "access_point", "printer", "phone", "nas", "camera", "other"].map((t) => deviceType(t).label).join(", ")}`],
    ["IP", "Adresse IPv4 ou IPv6 (facultative)."],
    ["Plan / Zone", "Créés automatiquement s'ils n'existent pas. Les zones créées sont à dessiner ensuite dans l'éditeur de plan."],
  ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildExport(): Promise<Buffer> {
  const devices = await prisma.device.findMany({
    orderBy: { name: "asc" },
    include: { plan: { select: { name: true } }, zone: { select: { name: true } } },
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Appareils");
  styleHeader(ws);
  ws.addRows(
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
  return Buffer.from(await wb.xlsx.writeBuffer());
}
