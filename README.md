# Kion Map

Cartographie du parc informatique : PC, serveurs, switchs, box, bornes Wi-Fi, imprimantes… placés sur des plans découpés en zones.

- **Plans** dessinés dans l'application (murs, pièces, textes) ou importés depuis une image (plan scanné).
- **Zones** en polygones (salle serveur, open space…). La zone d'un appareil se déduit de sa position sur le plan.
- **Recherche** par nom, IP, MAC, utilisateur, description, localisation, zone ou plan. Un clic amène au plan, avec l'appareil centré et mis en évidence.
- **Import / export Excel** (.xlsx, ou .csv avec `;` ou `,`).
- **Comptes et rôles** :

| Rôle | Droits |
| --- | --- |
| Utilisateur (`VIEWER`) | Consulte les plans, les zones et les appareils, et fait des recherches |
| Modérateur (`MODERATOR`) | En plus : crée et modifie plans, zones et appareils, importe des fichiers Excel |
| Super admin (`ADMIN`) | Tous les droits, dont la gestion des comptes |

## Stack

- [Next.js 16](https://nextjs.org) (App Router, route handlers pour l'API REST) + React 19 + Tailwind CSS 4
- [Prisma 7](https://www.prisma.io) avec SQLite (adapter `better-sqlite3`)
- Sessions JWT (`jose`) dans un cookie httpOnly, mots de passe hachés avec `bcryptjs`
- `exceljs` pour l'import et l'export

## Démarrage

Prérequis : Node.js ≥ 20.9.

```bash
npm install
cp .env.example .env         # puis renseignez SESSION_SECRET et le mot de passe admin
npx prisma migrate deploy    # crée la base SQLite dans ./data
npm run db:seed              # crée le super admin (ADMIN_USERNAME / ADMIN_PASSWORD)
# facultatif : npm run db:demo  -> super admin + un plan d'exemple avec zones et appareils
npm run dev                  # http://localhost:3000
```

En production :

```bash
npm run build
npm start
```

Mettez `COOKIE_SECURE="true"` quand l'application est servie en HTTPS.

### Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:migrate` | Applique les migrations Prisma |
| `npm run db:seed` | Crée le super admin s'il n'existe pas |
| `npm run db:demo` | Seed + données de démonstration (si aucun plan n'existe) |
| `npm run db:studio` | Prisma Studio, pour explorer la base |

## Import Excel

Téléchargez le modèle depuis **Appareils → Import Excel**. La première ligne contient les en-têtes, et seule la colonne **Nom** est obligatoire :

| Nom | Type | IP | MAC | Utilisateur | Description | Localisation | Plan | Zone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SRV-AD01 | Serveur | 192.168.1.10 | 00:1A:… | Service IT | Contrôleur de domaine | Baie A - U12 | RDC | Salle serveur |

- Les en-têtes courants sont reconnus aussi (« Adresse IP », « Hostname », « Emplacement », « Étage », « Salle »…), avec ou sans accents ni majuscules.
- Le type se déduit du libellé (« Poste », « Livebox », « Imprimante », « Borne wifi »… ; « Autre » par défaut).
- Un appareil dont le **nom** existe déjà est mis à jour. S'il reste sur le même plan, sa position est conservée.
- Les plans et zones inconnus sont créés. Les zones créées ainsi n'ont pas encore de contour : dessinez-le avec l'éditeur (**Zones → Dessiner**).
- Un rapport indique les créations, les mises à jour et les lignes ignorées (nom manquant, IP invalide…).

**Export Excel** (tous les rôles) : le même format, qu'on peut donc réimporter.

## Éditeur de plan (modérateur)

- 🖱️ **Sélection** : cliquer pour sélectionner, glisser pour déplacer. Glisser le fond déplace la vue et la molette zoome. Une zone sélectionnée affiche des poignées pour modifier son contour.
- 📏 **Mur** : cliquer point par point. Double-clic ou `Entrée` pour terminer, `Maj` pour un angle droit.
- ⬜ **Pièce** : glisser un rectangle.
- 🔤 **Texte** : cliquer à l'endroit voulu.
- 🔷 **Zone** : cliquer les sommets, puis cliquer le premier point (ou double-clic, ou `Entrée`) pour fermer.
- **Appareils** : bouton « Placer » puis clic sur le plan. Glisser un appareil le déplace, et sa zone est recalculée.
- **Plan** : nom, dimensions, image de fond (PNG/JPG/SVG ≤ 8 Mo), suppression.
- Raccourcis : `Suppr` pour supprimer la sélection, `Ctrl+Z` pour annuler, `Ctrl+S` pour enregistrer, `Échap` pour annuler l'action en cours.

Zones, appareils et réglages s'enregistrent immédiatement. Le dessin (murs, pièces, textes) s'enregistre avec le bouton **Enregistrer le dessin**.

## API REST

Toutes les routes exigent une session (cookie posé par `POST /api/auth/login`).

| Méthode | Route | Rôle minimum |
| --- | --- | --- |
| `POST` | `/api/auth/login`, `/api/auth/logout` | — |
| `PUT` | `/api/auth/password` | Utilisateur |
| `GET` | `/api/plans`, `/api/plans/:id` | Utilisateur |
| `POST` / `PATCH` / `DELETE` | `/api/plans`, `/api/plans/:id` | Modérateur |
| `POST` | `/api/plans/:id/zones` | Modérateur |
| `PATCH` / `DELETE` | `/api/zones/:id` | Modérateur |
| `GET` | `/api/devices?q=&type=&planId=&limit=`, `/api/devices/:id` | Utilisateur |
| `POST` / `PATCH` / `DELETE` | `/api/devices`, `/api/devices/:id` | Modérateur |
| `GET` | `/api/export` | Utilisateur |
| `GET` | `/api/import/template` | Modérateur |
| `POST` | `/api/import` (multipart, champ `file`) | Modérateur |
| `GET` / `POST` / `PATCH` / `DELETE` | `/api/users`, `/api/users/:id` | Super admin |

Cette API permettra de brancher plus tard d'autres sources de données (scan réseau, GLPI, Active Directory…) sans passer par Excel.

## Architecture

```
prisma/
  schema.prisma        modèles User, Plan, Zone, Device
  seed.ts              super admin + données de démo
src/
  proxy.ts             redirige vers /login les visiteurs non connectés
  app/
    login/             page de connexion
    (app)/             pages authentifiées : accueil, plans, éditeur, appareils, comptes
    api/               route handlers REST
  components/          plan-canvas (rendu SVG, zoom, déplacement de la vue), plan-viewer, plan-editor, formulaires…
  lib/
    auth.ts            session courante, contrôle des rôles
    devices.ts         position → zone, recherche
    excel.ts           import et export
    validation.ts      schémas zod
```

### Passer à PostgreSQL

1. Dans `prisma/schema.prisma`, mettez `provider = "postgresql"`.
2. Remplacez `@prisma/adapter-better-sqlite3` par `@prisma/adapter-pg` dans `src/lib/prisma.ts` et `prisma/seed.ts`.
3. Régénérez les migrations (`npx prisma migrate dev --name init`) et mettez à jour `DATABASE_URL`.
