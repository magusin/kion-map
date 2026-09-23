import { z } from "zod";

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/\d{1,2})?$/;
const ipv6 = /^[0-9a-f:]+(\/\d{1,3})?$/i;
export function isValidIp(ip: string) {
  return ipv4.test(ip) || (ip.includes(":") && ipv6.test(ip));
}

const point = z.tuple([z.number().finite(), z.number().finite()]);

export const shapeSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().max(40), kind: z.literal("wall"), points: z.array(point).min(2).max(500) }),
  z.object({
    id: z.string().max(40),
    kind: z.literal("room"),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
    label: z.string().max(100).optional(),
  }),
  z.object({
    id: z.string().max(40),
    kind: z.literal("text"),
    x: z.number(),
    y: z.number(),
    text: z.string().max(200),
    size: z.number().min(6).max(200),
  }),
]);

export const planCreateSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(100),
  description: optText(1000),
  width: z.coerce.number().int().min(200).max(10000).default(1200),
  height: z.coerce.number().int().min(200).max(10000).default(800),
});

export const planUpdateSchema = planCreateSchema.partial().extend({
  // data URL d'une image ou null pour retirer le fond.
  // Vercel limite le corps des requêtes à 4,5 Mo : l'éditeur compresse l'image avant l'envoi.
  background: z
    .string()
    .max(4_300_000, "Image trop lourde")
    .regex(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/, "Image invalide")
    .nullable()
    .optional(),
  shapes: z.array(shapeSchema).max(5000).optional(),
});

export const zoneSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(100),
  description: optText(1000),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, "Couleur invalide")
    .default("#3b82f6"),
  points: z.array(point).min(3, "Une zone doit avoir au moins 3 points").max(500),
});

export const deviceSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(100),
  type: z.string().trim().max(30).default("pc"),
  ip: optText(64).refine((v) => !v || isValidIp(v), "Adresse IP invalide"),
  mac: optText(64),
  assignedUser: optText(100),
  description: optText(2000),
  location: optText(200),
  planId: z.number().int().positive().nullish().transform((v) => v ?? null),
  zoneId: z.number().int().positive().nullish().transform((v) => v ?? null),
  x: z.number().finite().nullish().transform((v) => v ?? null),
  y: z.number().finite().nullish().transform((v) => v ?? null),
});

export const userCreateSchema = z.object({
  username: z.string().trim().min(2).max(64),
  password: z.string().min(8, "8 caractères minimum").max(200),
  displayName: optText(100),
  role: z.enum(["VIEWER", "MODERATOR", "ADMIN"]).default("VIEWER"),
});

export const userUpdateSchema = z.object({
  password: z.string().min(8, "8 caractères minimum").max(200).optional(),
  displayName: optText(100).optional(),
  role: z.enum(["VIEWER", "MODERATOR", "ADMIN"]).optional(),
});
