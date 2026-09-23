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
- [Prisma 7](https://www.prisma.io) avec PostgreSQL (hébergé sur [Neon](https://neon.tech), adapter `@prisma/adapter-pg`)
- Sessions JWT (`jose`) dans un cookie httpOnly, mots de passe hachés avec `bcryptjs`
- `exceljs` pour l'import et l'export

## Où sont stockées les données ?

**Tout est dans la base PostgreSQL** : comptes, plans (dessin et image de fond), zones et appareils. Le fichier Excel sert seulement à importer (ou exporter) des appareils. Une fois importés, ils vivent dans la base et se modifient dans l'application.

## Déploiement sur Vercel + Neon

1. **Base Neon** : sur Vercel, ouvrez le projet, puis **Storage → Create Database → Neon** (ou *Connect* si la base existe déjà) et liez-la au projet. L'intégration ajoute les variables `DATABASE_URL` (connexion poolée) et `DATABASE_URL_UNPOOLED` (connexion directe).
   - Si vous créez la base directement sur neon.tech, copiez ces deux URL depuis **Connect** (l'URL poolée contient `-pooler`) et ajoutez-les à la main dans Vercel.
2. **Autres variables** (Vercel → Settings → Environment Variables, pour *Production* et *Preview*) :

   | Variable | Valeur |
   | --- | --- |
   | `SESSION_SECRET` | Longue chaîne aléatoire : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
   | `ADMIN_USERNAME` | Identifiant du super admin, par exemple `admin` |
   | `ADMIN_PASSWORD` | Mot de passe du super admin (8 caractères minimum) |
   | `COOKIE_SECURE` | `true` |

3. **Branche de production** : `main`. Chaque push sur `main` déploie le site ; les autres branches donnent des déploiements *Preview*.
4. **Redéployez** (Deployments → ⋯ → Redeploy). Le script `vercel-build` :
   - applique les migrations (`prisma migrate deploy`), ce qui crée les tables au premier déploiement ;
   - crée le super admin s'il n'existe pas encore ;
   - construit l'application.
5. Connectez-vous avec `ADMIN_USERNAME` / `ADMIN_PASSWORD`, puis créez les autres comptes dans **Comptes**. Changer `ADMIN_PASSWORD` plus tard ne modifie pas un compte existant : changez le mot de passe dans l'application (**Mon compte**).

Limites propres à Vercel : un import Excel fait **4 Mo** au maximum, et les images de fond trop lourdes sont compressées automatiquement dans le navigateur avant l'envoi.

### Dépannage

Ouvrez **`https://<votre-site>/api/health`** (sans être connecté). La page indique ce qui ne va pas, sans jamais afficher de secret :

| Message | Solution |
| --- | --- |
| `tables absentes : migrations non appliquées` | Le script `vercel-build` n'a pas tourné. Dans Vercel → Settings → Build & Deployment, le **Build Command** ne doit pas être surchargé (laissez la valeur par défaut), puis redéployez. Sinon, lancez `npx prisma migrate deploy` depuis votre PC avec les URL Neon dans `.env`. |
| `SESSION_SECRET manquant ou trop court` | Ajoutez la variable (16 caractères minimum), puis redéployez. |
| `DATABASE_URL manquant` | Liez la base Neon au projet (Storage), ou ajoutez la variable pour l'environnement concerné (Production ou Preview). |
| `identifiants de DATABASE_URL refusés` | Le mot de passe Neon a changé : mettez à jour `DATABASE_URL` et `DATABASE_URL_UNPOOLED`. |
| `aucun super admin` | Définissez `ADMIN_PASSWORD` (8 caractères minimum), puis redéployez. |

Une variable ajoutée ou modifiée dans Vercel ne s'applique qu'**après un redéploiement**.

## Développement en local

Prérequis : Node.js ≥ 20.9 et une base PostgreSQL. Le plus simple est une **branche de développement Neon** (Neon → Branches → New branch), pour ne pas toucher aux données de production. Un PostgreSQL local fonctionne aussi.

```bash
git clone https://github.com/magusin/kion-map.git
cd kion-map
npm install
cp .env.example .env         # sous Windows : copy .env.example .env
# éditez .env : DATABASE_URL, SESSION_SECRET, ADMIN_PASSWORD, COOKIE_SECURE="false"
npx prisma migrate deploy    # crée les tables
npm run db:seed              # crée le super admin
# facultatif : npm run db:demo  -> un plan d'exemple avec zones et appareils
npm run dev                  # http://localhost:3000
```

### Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run vercel-build` | Build utilisé par Vercel : migrations, super admin, build |
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
- Fichier de 4 Mo maximum. Seule la première feuille du classeur est lue.
- Les noms (appareils, plans, zones) sont comparés sans tenir compte des majuscules : « srv-ad01 » met à jour « SRV-AD01 ».
- Un rapport indique les créations, les mises à jour et les lignes ignorées (nom manquant, IP invalide…).

**Export Excel** (tous les rôles) : le même format, qu'on peut donc réimporter.

## Éditeur de plan (modérateur)

- 🖱️ **Sélection** : cliquer pour sélectionner, glisser pour déplacer. Glisser le fond déplace la vue et la molette zoome. Une zone sélectionnée affiche des poignées pour modifier son contour.
- 📏 **Mur** : cliquer point par point. Double-clic ou `Entrée` pour terminer, `Maj` pour un angle droit.
- ⬜ **Pièce** : glisser un rectangle.
- 🔤 **Texte** : cliquer à l'endroit voulu.
- 🔷 **Zone** : cliquer les sommets, puis cliquer le premier point (ou double-clic, ou `Entrée`) pour fermer.
- **Appareils** : bouton « Placer » puis clic sur le plan. Glisser un appareil le déplace, et sa zone est recalculée.
- **Plan** : nom, dimensions, image de fond (PNG/JPG/SVG, compressée automatiquement si elle est lourde), suppression.
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
