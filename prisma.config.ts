import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Valeur par défaut pour que `npm install` fonctionne avant la création du .env
    url: process.env.DATABASE_URL ?? "file:./data/kion-map.db",
  },
});
