import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

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

  if (process.argv.includes("--demo") && (await prisma.plan.count()) === 0) {
    const rdc = await prisma.plan.create({
      data: {
        name: "RDC",
        description: "Rez-de-chaussée (exemple)",
        width: 1200,
        height: 800,
        shapes: [
          { id: "w1", kind: "wall", points: [[40, 40], [1160, 40], [1160, 760], [40, 760], [40, 40]] },
          { id: "w2", kind: "wall", points: [[500, 40], [500, 420]] },
          { id: "w3", kind: "wall", points: [[40, 420], [1160, 420]] },
          { id: "t1", kind: "text", x: 600, y: 790, text: "Entrée", size: 18 },
        ],
      },
    });
    const server = await prisma.zone.create({
      data: { planId: rdc.id, name: "Salle serveur", color: "#7c3aed", points: [[40, 40], [500, 40], [500, 420], [40, 420]] },
    });
    const open = await prisma.zone.create({
      data: { planId: rdc.id, name: "Open space", color: "#059669", points: [[40, 420], [1160, 420], [1160, 760], [40, 760]] },
    });
    await prisma.zone.create({
      data: { planId: rdc.id, name: "Direction", color: "#d97706", points: [[500, 40], [1160, 40], [1160, 420], [500, 420]] },
    });
    await prisma.device.createMany({
      data: [
        { name: "BOX-FIBRE", type: "box", ip: "192.168.1.1", description: "Box opérateur", location: "Baie A", planId: rdc.id, zoneId: server.id, x: 120, y: 120 },
        { name: "SW-CORE", type: "switch", ip: "192.168.1.2", description: "Switch cœur 48 ports", location: "Baie A - U40", planId: rdc.id, zoneId: server.id, x: 220, y: 120 },
        { name: "SRV-AD01", type: "server", ip: "192.168.1.10", assignedUser: "Service IT", description: "Contrôleur de domaine", location: "Baie A - U12", planId: rdc.id, zoneId: server.id, x: 320, y: 120 },
        { name: "PC-ACCUEIL", type: "pc", ip: "192.168.1.50", assignedUser: "Accueil", description: "Poste d'accueil", location: "Banque d'accueil", planId: rdc.id, zoneId: open.id, x: 600, y: 700 },
        { name: "IMP-RDC", type: "printer", ip: "192.168.1.80", description: "Imprimante multifonction", location: "Open space", planId: rdc.id, zoneId: open.id, x: 1080, y: 480 },
        { name: "AP-RDC", type: "access_point", ip: "192.168.1.30", description: "Borne Wi-Fi plafond", planId: rdc.id, zoneId: open.id, x: 600, y: 560 },
        { name: "PC-NONPLACE", type: "laptop", ip: "192.168.1.61", assignedUser: "Jean Martin", description: "Portable à placer sur un plan" },
      ],
    });
    console.log("Données de démonstration ajoutées.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
