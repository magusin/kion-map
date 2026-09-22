import { handle } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { buildExport } from "@/lib/excel";

export const GET = handle(async () => {
  await requireApiUser();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(new Uint8Array(await buildExport()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="appareils-${date}.xlsx"`,
    },
  });
});
