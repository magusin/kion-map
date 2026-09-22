import type { DeviceDTO } from "./types";

/** Lien vers l'appareil : sur son plan s'il est placé, sinon dans la liste. */
export function deviceHref(d: Pick<DeviceDTO, "id" | "planId">) {
  return d.planId ? `/plans/${d.planId}?device=${d.id}` : `/devices?id=${d.id}`;
}
