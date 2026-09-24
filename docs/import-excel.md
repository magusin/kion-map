# Import Excel des appareils

Ce document décrit le fichier Excel qui permet d'ajouter ou de mettre à jour des appareils dans Kion Map.

- **Télécharger le modèle** : dans l'application, **Appareils → ⬆ Import Excel → Télécharger le modèle Excel** (`GET /api/import/template`).
- **Importer** : **Appareils → ⬆ Import Excel**, choisir le fichier, puis **Importer**. Il faut un compte Modérateur ou Super admin.
- **Formats acceptés** : `.xlsx`, ou `.csv` avec `;` ou `,` comme séparateur. **4 Mo maximum** (limite de Vercel).

Les données importées sont enregistrées dans la base PostgreSQL. Le fichier lui-même n'est pas conservé : modifier l'Excel après coup ne change rien dans l'application tant qu'il n'est pas réimporté.

## Structure du modèle

| Onglet | Rôle |
| --- | --- |
| **Appareils** | Les données, une ligne par appareil. **C'est le seul onglet lu à l'import** : il doit rester le premier. |
| **Mode d'emploi** | Étapes et règles, repris ci-dessous. |
| **Listes** | Valeurs autorisées pour la colonne Type. Cet onglet alimente la liste déroulante : ne le supprimez pas. |

L'**export Excel** (**Appareils → ⬇ Export Excel**, disponible pour tous les rôles) produit exactement le même format. On peut donc exporter, corriger, puis réimporter.

## Colonnes

La ligne 1 contient les en-têtes. L'ordre des colonnes est libre, et les accents et majuscules des en-têtes sont ignorés.

| Colonne | Obligatoire | Autres en-têtes reconnus | Contenu | Max. |
| --- | --- | --- | --- | --- |
| **Nom** | **oui** | Hostname, Nom machine, Appareil, Équipement | Identifiant **unique** de l'appareil | 100 |
| Type | non | Catégorie | Une valeur de la liste (voir ci-dessous) | — |
| IP | non | Adresse IP | IPv4 (`10.0.20.21`, `10.0.0.0/24`) ou IPv6 | 64 |
| MAC | non | Adresse MAC | `00:1A:2B:3C:4D:5E` | 64 |
| Utilisateur | non | Opérateur, User, Propriétaire, Responsable, Collaborateur | Prénom Nom, ou un service pour un équipement partagé | 100 |
| Description | non | Commentaire, Remarque, Notes | Texte libre | 2000 |
| Localisation | non | Emplacement, Bureau, Lieu | Précision libre (`Bureau 12`, `Baie A - U12`) | 200 |
| Plan | conseillé | Étage, Bâtiment, Site | Nom du plan (`RDC`, `1er étage`) | 100 |
| Zone | conseillé | Salle, Pièce, Local | Nom de la zone dans ce plan (`Comptabilité`) | 100 |

### Valeurs de la colonne Type

`PC fixe`, `Portable`, `Serveur`, `Switch`, `Routeur`, `Box internet`, `Pare-feu`, `Borne Wi-Fi`, `Imprimante`, `Téléphone IP`, `NAS / stockage`, `Caméra`, `Autre`.

Un libellé proche est aussi compris : `Poste` → PC fixe, `Livebox` → Box internet, `Copieur` → Imprimante, `Wifi` → Borne Wi-Fi, etc. Un type non reconnu devient `Autre`, et une cellule vide devient `PC fixe`.

## Exemple

| Nom | Type | IP | MAC | Utilisateur | Description | Localisation | Plan | Zone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PC-ACHATS-01 | PC fixe | 10.0.20.31 | 00:1A:3F:22:8B:01 | Claire Martin | Dell OptiPlex 7010 – poste achats | Bureau 14 | 1er étage | Achats |
| TEL-ACHATS-01 | Téléphone IP | 10.0.20.131 | 00:1A:3F:22:8B:02 | Claire Martin | Yealink T54W | Bureau 14 | 1er étage | Achats |
| IMP-ACHATS | Imprimante | 10.0.20.85 | 00:1A:3F:22:8B:04 | Service achats | HP LaserJet M507 – partagée | Couloir 1er | 1er étage | Achats |
| SRV-GED | Serveur | 10.0.1.40 | 00:1A:3F:22:8B:05 | Service IT | Serveur GED (VM) | Salle serveur - Baie B U20 | RDC | Baie B (serveurs) |
| LT-STOCK-10 | Portable | | 00:1A:3F:22:8B:08 | | Portable neuf en stock | Armoire IT | | |

Le modèle téléchargé contient 8 lignes d'exemple de ce type. **Supprimez-les avant d'importer vos données**, sinon elles seront importées elles aussi.

## Aides intégrées au modèle

- **Liste déroulante** sur la colonne Type.
- **Contrôle des noms en double** : Excel refuse un Nom déjà présent dans le fichier.
- **Avertissement** si une Zone est remplie sans Plan.
- **Longueur maximale** contrôlée pour chaque colonne (voir le tableau).
- **Bulle d'aide** sur chaque colonne quand on sélectionne une cellule.
- IP et MAC sont au **format texte**, pour qu'Excel ne les transforme pas en nombres.
- En-têtes figés et filtres activés. La colonne **Nom** (obligatoire) a un en-tête rouge.

Ces contrôles s'appliquent à la saisie, et un copier-coller les contourne ; l'application revérifie de toute façon les données à l'import. Ils couvrent les 1 000 premières lignes, ou le nombre d'appareils exportés + 100. Au-delà, l'import fonctionne quand même.

## Règles d'import

- **Clé = Nom.** Un nom déjà présent en base **met à jour** l'appareil au lieu d'en créer un nouveau. La casse est ignorée : `pc-achats-01` = `PC-ACHATS-01`.
- **Plans et zones créés automatiquement** s'ils n'existent pas. Une zone créée ainsi n'a pas encore de contour : il faut la dessiner dans l'éditeur (**Zones → Dessiner**).
- **Correspondance des noms** de plans et de zones : les majuscules, les accents, les espaces en trop et les séparateurs `-` `_` `.` sont ignorés (`comptabilite` = `Comptabilité`, `Salle-serveur` = `Salle serveur`). Un nom différent (`Compta`), ou mal orthographié, **crée une nouvelle zone** : vérifiez la liste « Zones créées » du rapport.
- **Une zone n'est cherchée que dans le plan de la même ligne.** « Comptabilité » avec le plan « RDC » ne trouve pas celle du « 1er étage ».
- **Une zone sans plan est ignorée** et signalée dans le rapport.

### Placement automatique dans les zones

Quand une ligne indique une **zone déjà dessinée**, l'appareil est **posé automatiquement dans cette zone**. Les appareils sont rangés en grille, à partir du coin supérieur gauche, à l'écart de ceux déjà présents, et jamais dans une sous-zone incluse dans la zone.

| Situation de l'appareil | Résultat |
| --- | --- |
| Nouvel appareil | Posé dans la zone |
| Existant, sans zone ou sans position | Posé dans la zone |
| Existant, placé dans **une autre zone** (zone fausse ou changée) | **Déplacé** dans la zone du fichier |
| Existant, déjà placé **dans cette zone** (y compris dans une sous-zone : un serveur de « Baie B » quand le fichier indique « Salle serveur ») | Position **conservée** |
| Zone **pas encore dessinée** (par exemple créée par l'import) | Rattaché à la zone, sans position. Il sera posé automatiquement **dès que le contour de la zone sera dessiné**. |
| Pas de zone dans le fichier | Position conservée s'il reste sur le même plan ; sinon il est à placer |

Un réimport du même fichier ne déplace donc rien. Une fois l'appareil posé, un modérateur ou un super admin peut **ajuster sa position** : fiche de l'appareil → **📍 Déplacer**, ou glisser dans l'éditeur. La zone suit la position.
- **Lignes ignorées** : nom manquant, ou IP invalide (`10.0.300.1`). Le rapport donne le numéro de ligne et la raison.
- **Lignes vides** : ignorées sans erreur.
- **Supprimer une ligne du fichier ne supprime pas l'appareil.** La suppression se fait dans l'application (fiche de l'appareil → Modifier → Supprimer).
- **Utilisateur** : écrivez toujours le nom de la même façon. C'est ce champ qui regroupe les postes d'une personne dans l'onglet **Opérateurs**.

## Rapport d'import

Après l'import, l'application affiche :

- le nombre d'appareils **créés**, **mis à jour** et **ignorés** ;
- le nombre d'appareils **placés automatiquement** dans leur zone, et ceux **en attente** d'une zone à dessiner ;
- les **plans** et **zones** créés ;
- les **avertissements**, avec le numéro de ligne Excel.

## Après l'import

1. Les appareils dont la zone était dessinée sont **déjà sur le plan**. Ajustez leur position si besoin (fiche → **📍 Déplacer**).
2. Pour les zones créées par l'import : **Plans →** ouvrez le plan, puis **✏️** → onglet **Zones** → **Dessiner**, en suivant les coins de la pièce. Les appareils de cette zone y sont posés automatiquement.
3. Les appareils sans zone : fiche → **📍 Placer sur le plan**, ou dans l'éditeur, onglet **Appareils** → **Placer**.

## Pour les développeurs

- Placement automatique : `AutoPlacer` et `placeWaitingDevices` dans [`src/lib/devices.ts`](../src/lib/devices.ts). `PATCH /api/zones/:id` pose les appareils en attente quand un contour est dessiné.
- Lecture et écriture : [`src/lib/excel.ts`](../src/lib/excel.ts). Les en-têtes reconnus sont dans `COLUMNS`, les aides et limites dans `HELP`, les exemples dans `TEMPLATE_EXAMPLES`.
- Routes : `POST /api/import` (multipart, champ `file`), `GET /api/import/template`, `GET /api/export`.
- Types d'appareils et correspondance des libellés : `DEVICE_TYPES` et `normalizeDeviceType` dans [`src/lib/types.ts`](../src/lib/types.ts).
- Limites de longueur : elles correspondent aux schémas de [`src/lib/validation.ts`](../src/lib/validation.ts).
