import "server-only";
import type { DeviceDTO, PlanDTO, Point, Shape, ZoneDTO } from "./types";

// Conversion des modèles Prisma (champs Json) vers les types partagés.

export function toPlanDTO(p: { id: number; name: string; description: string | null; width: number; height: number; background: string | null; shapes: unknown }): PlanDTO {
  return { id: p.id, name: p.name, description: p.description, width: p.width, height: p.height, background: p.background, shapes: (p.shapes as Shape[]) ?? [] };
}

export function toZoneDTO(z: { id: number; planId: number; name: string; description: string | null; color: string; points: unknown }): ZoneDTO {
  return { id: z.id, planId: z.planId, name: z.name, description: z.description, color: z.color, points: (z.points as Point[]) ?? [] };
}

export function toDeviceDTO<T extends DeviceDTO>(d: T): DeviceDTO {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    ip: d.ip,
    mac: d.mac,
    assignedUser: d.assignedUser,
    description: d.description,
    location: d.location,
    planId: d.planId,
    zoneId: d.zoneId,
    x: d.x,
    y: d.y,
    plan: d.plan ?? null,
    zone: d.zone ?? null,
  };
}
