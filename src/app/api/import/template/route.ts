import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { buildTemplate } from "@/lib/excel";

export const GET = handle(async () => {
  await requireApiUser("MODERATOR");
  return new Response(new Uint8Array(await buildTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modele-import-kion-map.xlsx"',
    },
  });
});
