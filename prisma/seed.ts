import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { resetDemo, seedDemo } from "./demo";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL }),
});

async function main() {
  // trim : un espace copié-collé par erreur dans Vercel rendrait la connexion impossible
  const username = (process.env.ADMIN_USERNAME || "admin").trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  const reset = process.env.ADMIN_RESET_PASSWORD === "true";
  const existing = await prisma.user.findFirst({ where: { username: { equals: username, mode: "insensitive" } } });

  if (!password || password.length < 8) {
    // Pas de mot de passe par défaut : l'application est en ligne.
    if (!existing) console.warn("ADMIN_PASSWORD absent ou trop court (8 caractères min.) : super admin non créé.");
    else console.log(`Le compte « ${existing.username} » existe déjà.`);
  } else if (existing && reset) {
    // Réinitialisation explicite : ADMIN_RESET_PASSWORD=true le temps d'un déploiement.
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await bcrypt.hash(password, 10), role: "ADMIN" },
    });
    console.log(`Mot de passe du compte « ${existing.username} » réinitialisé. Retirez ADMIN_RESET_PASSWORD.`);
  } else if (existing) {
    console.log(`Le compte « ${existing.username} » existe déjà, mot de passe inchangé (ADMIN_RESET_PASSWORD=true pour le réinitialiser).`);
  } else {
    await prisma.user.create({
      data: { username, passwordHash: await bcrypt.hash(password, 10), displayName: "Super admin", role: "ADMIN" },
    });
    console.log(`Super admin « ${username} » créé.`);
  }

  // Données de démonstration : `npm run db:demo`, ou SEED_DEMO=true sur Vercel.
  // SEED_DEMO=reset : supprime puis recrée uniquement les données de démonstration.
  const demo = process.env.SEED_DEMO;
  if (demo === "reset") await resetDemo(prisma);
  if (process.argv.includes("--demo") || demo === "true" || demo === "reset") {
    await seedDemo(prisma);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
