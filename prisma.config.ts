import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Les migrations passent par la connexion directe (non poolée) si elle est fournie,
    // comme DATABASE_URL_UNPOOLED créée par l'intégration Neon de Vercel.
    // Valeur par défaut pour que `npm install` / `prisma generate` fonctionnent sans .env.
    url:
      process.env.DATABASE_URL_UNPOOLED ??
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/kion",
  },
});
