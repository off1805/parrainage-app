# API — Programme de parrainage

Documentation de référence pour implémenter le front. Tous les exemples sont
des réponses **réellement observées** sur l'API, pas des approximations.

- **Base URL** : `http://localhost:3000` (variable `PORT`)
- **Format** : JSON UTF-8, sauf l'export XLSX
- **Authentification** : ⚠️ **aucune**. Voir [Sécurité](#sécurité) en fin de document.
- **CORS** : autorisé uniquement depuis `FRONTEND_URL`

> `GET /` renvoie `"Hello World!"` : c'est un endpoint de démonstration du
> squelette NestJS, sans rapport avec le domaine. L'ignorer.

---

## Sommaire

1. [Étudiants](#1-étudiants) · 2. [Import](#2-import-detudiants) · 3. [Invitations](#3-invitations-de-profil) · 4. [Contraintes](#4-contraintes-de-parrainage) · 5. [Sessions](#5-sessions-de-parrainage) · 6. [Export](#6-export-xlsx) · 7. [Erreurs](#7-format-des-erreurs)

---

## Types partagés

### `Student`

```ts
type StudentLevel = 'ING3' | 'ING4';   // ING4 = parrain, ING3 = filleul

interface Student {
  id: string;              // UUID
  firstName: string;
  lastName: string;
  email: string;           // unique, toujours en minuscules
  matricule: string | null;
  level: StudentLevel;
  whatsapp: string | null;          // renseigné par l'étudiant via l'invitation
  profilePictureUrl: string | null; // renseigné par l'étudiant via l'invitation
  maxMentees: number | null;       // capacité, ING4 uniquement (null pour un ING3)
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
}
```

> **Le profil est « complété »** quand `profilePictureUrl !== null`.
> `maxMentees` n'a de sens que pour un `ING4` et vaut toujours `null` pour un `ING3`.

### Enums

| Enum | Valeurs |
|---|---|
| `InvitationStatus` | `PENDING` · `USED` · `EXPIRED` · `CANCELLED` |
| `PairingSessionStatus` | `DRAFT` · `GENERATED` · `FINALIZED` |
| `PairingOrigin` | `RANDOM` · `PRECONFIGURED` · `MANUAL` |
| `PairingConstraintType` | `REQUIRED` · `FORBIDDEN` |

### `StudentRef`

Version allégée d'un étudiant, imbriquée dans les résultats de tirage.

```ts
interface StudentRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  matricule: string | null;
  whatsapp: string | null;
  profilePictureUrl: string | null;
}
```

---

## 1. Étudiants

### `GET /students`

Liste des étudiants, avec filtres facultatifs.

**Query**

| Param | Type | Requis | Description |
|---|---|---|---|
| `level` | `ING3` \| `ING4` | non | Filtre sur le niveau. Valeur invalide → `400`. |
| `search` | `string` | non | Recherche partielle sur le **nom** (max 100 caractères). |

**`200` → `Student[]`**, triés par `lastName` puis `firstName` (ascendants).

```bash
curl "http://localhost:3000/students?level=ING4"
```

```json
[
  {
    "id": "c7cbd4ab-216d-4a36-bf5b-d55ab9a2f1d7",
    "firstName": "Paul",
    "lastName": "Durand",
    "email": "paul.durand@school.fr",
    "matricule": "M1001",
    "level": "ING4",
    "whatsapp": null,
    "profilePictureUrl": null,
    "maxMentees": 1,
    "createdAt": "2026-09-29T18:51:17.593Z",
    "updatedAt": "2026-09-29T18:51:17.593Z"
  }
]
```

### `GET /students/:id`

Détail d'un étudiant. `:id` doit être un **UUID**.

**`200` → `Student`** · **`404`** si l'étudiant n'existe pas.

```json
{ "message": "Étudiant introuvable : <id>", "error": "Not Found", "statusCode": 404 }
```

### `PATCH /students/:id`

Mise à jour administrative. **Tous les champs sont facultatifs**, seuls ceux
envoyés sont modifiés.

| Champ | Type | Contraintes |
|---|---|---|
| `firstName` | `string` | 1 à 100 caractères |
| `lastName` | `string` | 1 à 100 caractères |
| `matricule` | `string` | ≤ 50 caractères |
| `profilePictureUrl` | `string` | URL, ≤ 512 caractères |
| `whatsapp` | `string` | ≤ 32 caractères |
| `maxMentees` | `number` | entier, 1 à 50 |

> **`email` et `level` ne sont pas modifiables.** Ils proviennent de l'import et
> envoyer l'un d'eux renvoie `400` (`property email should not exist`).

**`200` → `Student`**

```bash
curl -X PATCH http://localhost:3000/students/<id> \
  -H 'Content-Type: application/json' -d '{"maxMentees":3}'
```

**Erreurs** : `400` (validation), `404` (inconnu)

> Usage principal : fixer la capacité `maxMentees` des parrains avant le tirage.

---

## 2. Import d'étudiants

### `POST /students/import`

Importe un fichier **CSV** ou **XLSX** en une requête. Les lignes valides sont
insérées en une transaction ; les lignes invalides sont listées dans la réponse
sans faire échouer l'import.

**Content-Type** : `multipart/form-data` · **Champ fichier** : `file` · **Taille max** : 5 Mo

**Colonnes attendues** (l'ordre n'importe pas, la casse/les accents/espaces sont ignorés) :

| Colonne | Alias acceptés | Obligatoire | Règle |
|---|---|---|---|
| `firstName` | `prenom`, `first` | oui | non vide, ≤ 100 |
| `lastName` | `nom`, `last` | oui | non vide, ≤ 100 |
| `email` | `mail`, `courriel` | oui | format email valide, unique |
| `matricule` | `mat` | non | ≤ 50 |
| `level` | `niveau`, `promo`, `promotion` | oui | `ING3` / `ING4` (accepte `4 ING`, `3ing`…) |
| `maxMentees` | `capacity`, `capacite`, `maxfilleuls` | oui si `ING4` | entier 1–50, ignoré pour un `ING3` |

**`201` → `ImportResult`**

```ts
interface ImportResult {
  imported: number;               // lignes insérées
  rejected: number;               // lignes rejetées
  errors: {                       // vide si rejected === 0
    row: number;                  // n° de ligne dans le fichier, en-tête inclus
    email?: string;               // email de la ligne fautive si exploitable
    message: string;              // motif du rejet, à afficher tel quel
  }[];
}
```

**Cas nominal :**

```json
{ "imported": 12, "rejected": 0, "errors": [] }
```

**Cas partiel (le front doit afficher `errors` à l'utilisateur) :**

```json
{
  "imported": 0,
  "rejected": 5,
  "errors": [
    { "row": 2, "email": "ivan.petit@@school.fr", "message": "email est invalide" },
    { "row": 3, "email": "julie.petit@school.fr", "message": "level doit valoir ING3 ou ING4" },
    { "row": 4, "email": "zero.cap@school.fr", "message": "maxMentees doit être supérieur ou égal à 1" },
    { "row": 5, "email": "nocap@school.fr", "message": "maxMentees est obligatoire pour un ING4" },
    { "row": 6, "email": "paul.durand@school.fr", "message": "email déjà importé" }
  ]
}
```

**Erreurs `400`** (fichier rejeté dans son ensemble, aucun import) :
`Le fichier est vide` · `Colonne inconnue : "<colonne>". Colonnes attendues : …` ·
`Format non supporté : utiliser un fichier .csv ou .xlsx` ·
`Aucun fichier reçu (champ multipart "file")`

> Un doublon est détecté **dans le fichier** (`email en double dans le fichier`)
> et **en base** (`email déjà importé`).

---

## 3. Invitations de profil

L'administrateur envoie un lien par email. L'étudiant ouvre le formulaire sur
le front et renseigne **uniquement sa photo et son WhatsApp**.

```
GET /invitations/verify?token=…
        ↓ affiche le formulaire
POST /invitations/complete   { token, profilePictureUrl, whatsapp }
```

Le lien construit et envoyé par l'API est :
`${FRONTEND_URL}/invitation?token=<token>`

### `POST /students/:studentId/invitations`

Crée une invitation et envoie l'email. `:studentId` doit être un **UUID**.

**Aucun body.**

**`201` → `InvitationResult`**

```ts
interface InvitationResult {
  invitation: {
    id: string;
    studentId: string;
    status: 'PENDING';
    sentAt: string;      // ISO 8601
    expiresAt: string;   // ISO 8601 — sentAt + PROFILE_INVITATION_EXPIRATION_HOURS
    usedAt: null;
    createdAt: string;
  };
  email: {
    total: number;
    sent: number;
    failed: { email: string; reason: string }[];   // vérifier avant d'afficher "envoyé"
  };
}
```

```json
{
  "invitation": {
    "id": "8bc470d1-ee73-4d64-ad78-64fc615522f4",
    "studentId": "ad60679e-d3bc-4cb4-ba84-75c2212adee7",
    "status": "PENDING",
    "sentAt": "2026-09-29T18:52:12.512Z",
    "expiresAt": "2026-10-02T18:52:12.512Z",
    "usedAt": null,
    "createdAt": "2026-09-29T18:52:12.513Z"
  },
  "email": { "total": 1, "sent": 1, "failed": [] }
}
```

> **Le token n'est jamais renvoyé** (ni en clair, ni son hash) : il n'existe que
> dans l'email envoyé. L'API renvoie `201` même si l'envoi SMTP échoue — dans ce
> cas `email.failed` est renseigné et l'invitation reste `PENDING` (renvoyable).

**Erreurs** : `404` (étudiant inconnu)

### `POST /students/:studentId/invitations/resend`

**Identique au endpoint précédent**, avec deux différences :

1. les invitations `PENDING` existantes sont passées à `CANCELLED` (leurs tokens
   deviennent inutilisables) ;
2. une nouvelle invitation est émise.

Utiliser ce endpoint pour renvoyer un lien. **Erreurs** : `404`.

### `GET /invitations/verify`

Vérifie qu'un token est encore utilisable. À appeler à l'affichage du formulaire.

**Query**

| Param | Type | Règle |
|---|---|---|
| `token` | `string` | 16 à 256 caractères |

**`200` → `InvitationPreview`**

```json
{ "firstName": "Alice", "expiresAt": "2026-10-02T18:52:12.512Z" }
```

> Ne contient **ni email, ni matricule, ni WhatsApp** : c'est volontaire, pour
> ne rien divulguer à quelqu'un qui intercepte le lien.

**Erreurs**

| Code | Cas | Message |
|---|---|---|
| `400` | token trop court / absent | `token must be longer than or equal to 16 characters` |
| `404` | token inconnu | `Invitation inconnue` |
| `410` | déjà utilisée | `Cette invitation a déjà été utilisée` |
| `410` | expirée | `Cette invitation a expiré` |
| `410` | annulée (renvoi effectué) | `Cette invitation a été annulée` |

### `POST /invitations/complete`

Enregistre la photo et le WhatsApp, puis consomme le token (**usage unique**).

**Body** — tous les champs sont requis, aucun autre n'est accepté :

| Champ | Type | Règle |
|---|---|---|
| `token` | `string` | 16 à 256 caractères |
| `profilePictureUrl` | `string` | ≤ 512 caractères |
| `whatsapp` | `string` | `/^[+0-9][0-9\s().-]{5,31}$/` |

```bash
curl -X POST http://localhost:3000/invitations/complete \
  -H 'Content-Type: application/json' \
  -d '{"token":"NKIXX7V0Hb-...","profilePictureUrl":"https://cdn.school.fr/a.jpg","whatsapp":"+33612345678"}'
```

**`201` → `InvitationPreview`** (identique à `verify`)

```json
{ "firstName": "Alice", "expiresAt": "2026-10-02T18:52:12.512Z" }
```

**Erreurs** : `400` (validation / WhatsApp mal formé) · `404` (token inconnu) · `410` (utilisé, expiré, annulé)

> **Périmètre strict** : `firstName`, `lastName`, `email`, `matricule` et `level`
> ne sont **pas** modifiables par ce formulaire. Les envoyer renvoie
> `400 property firstName should not exist`.

---

## 4. Contraintes de parrainage

Les couples saisis par l'administrateur **avant** le tirage :
`REQUIRED` (imposé) et `FORBIDDEN` (interdit).

### `GET /pairing-constraints`

**Query** : `type` — `REQUIRED` | `FORBIDDEN` (facultatif)

**`200` → `PairingConstraint[]`**, triés par `createdAt` décroissant.

```ts
interface PairingConstraint {
  id: string;
  sponsorId: string;       // doit être un ING4
  menteeId: string;        // doit être un ING3
  type: 'REQUIRED' | 'FORBIDDEN';
  reason: string | null;
  createdAt: string;
}
```

```json
[
  {
    "id": "be54e288-f409-417c-84c4-86dd59eae6c9",
    "sponsorId": "c7cbd4ab-216d-4a36-bf5b-d55ab9a2f1d7",
    "menteeId": "ad60679e-d3bc-4cb4-ba84-75c2212adee7",
    "type": "REQUIRED",
    "reason": "même promotion",
    "createdAt": "2026-09-29T18:51:26.232Z"
  }
]
```

### `POST /pairing-constraints`

**Body**

| Champ | Type | Règle |
|---|---|---|
| `sponsorId` | `uuid` | doit désigner un `ING4` |
| `menteeId` | `uuid` | doit désigner un `ING3`, différent de `sponsorId` |
| `type` | `REQUIRED` \| `FORBIDDEN` | |
| `reason` | `string` | facultatif, ≤ 500 caractères |

**`201` → `PairingConstraint`**

**Erreurs métier** (le champ `code` permet d'afficher le bon message) :

| Code HTTP | `code` | Cas |
|---|---|---|
| `400` | `INVALID_SPONSOR` | le parrain n'est pas un ING4 |
| `400` | `INVALID_MENTEE` | le filleul n'est pas un ING3 |
| `400` | `DUPLICATE_REQUIRED_MENTEE` | ce filleul a déjà un parrain obligatoire |
| `400` | `REQUIRED_CAPACITY_EXCEEDED` | dépasserait `maxMentees` du parrain |
| `400` | — | auto-parrainage (`sponsorId === menteeId`) |
| `409` | `REQUIRED_PAIRING_CONFLICT` | le couple existe déjà avec le type opposé |
| `409` | — | contrainte identique déjà enregistrée |
| `400` | — | validation du payload |

```json
{ "code": "INVALID_SPONSOR", "message": "Le parrain doit être un ING4" }
```

### `DELETE /pairing-constraints/:id`

Supprime une contrainte. **`204`** sans contenu.
**`400`** `{ "message": "Contrainte introuvable : <id>", ... }` si elle n'existe pas.

---

## 5. Sessions de parrainage

Une session encapsule un tirage : `DRAFT` → `GENERATED` → `FINALIZED`.
Une session finalisée est **figée**.

### `GET /pairing-sessions`

**`200` → `PairingSession[]`**, de la plus récente à la plus ancienne.

```ts
interface PairingSession {
  id: string;
  status: 'DRAFT' | 'GENERATED' | 'FINALIZED';
  createdAt: string;
  generatedAt: string | null;
  finalizedAt: string | null;
}
```

### `POST /pairing-sessions`

Crée une session vide. **Aucun body.** **`201` → `PairingSession`** (`status: "DRAFT"`).

### `GET /pairing-sessions/:id`

**`200` → `PairingSessionView`** — la session **avec tous ses couples**.

```ts
interface PairingSessionView {
  id: string;
  status: 'DRAFT' | 'GENERATED' | 'FINALIZED';
  createdAt: string;
  generatedAt: string | null;
  finalizedAt: string | null;
  pairings: {
    id: string;
    origin: 'RANDOM' | 'PRECONFIGURED' | 'MANUAL';
    sponsor: StudentRef;
    mentee: StudentRef;
  }[];
}
```

Les couples sont triés par nom de parrain puis de filleul. `pairings` vaut `[]`
si la session est en `DRAFT`.

```json
{
  "id": "e19c5573-0232-4f59-b626-3c2fd0a9d1b2",
  "status": "GENERATED",
  "createdAt": "2026-09-29T18:51:33.259Z",
  "generatedAt": "2026-09-29T18:51:33.502Z",
  "finalizedAt": null,
  "pairings": [
    {
      "id": "cc897f6b-8baf-49a7-913f-7613b1c8794f",
      "origin": "PRECONFIGURED",
      "sponsor": {
        "id": "c7cbd4ab-216d-4a36-bf5b-d55ab9a2f1d7",
        "firstName": "Paul", "lastName": "Durand",
        "email": "paul.durand@school.fr", "matricule": "M1001",
        "whatsapp": null, "profilePictureUrl": null
      },
      "mentee": {
        "id": "ad60679e-d3bc-4cb4-ba84-75c2212adee7",
        "firstName": "Alice", "lastName": "Bernard",
        "email": "alice.bernard@school.fr", "matricule": "M2001",
        "whatsapp": null, "profilePictureUrl": null
      }
    }
  ]
}
```

> `origin` est une information **interne** : elle n'apparaît pas dans l'export.
> `PRECONFIGURED` = issu d'une contrainte `REQUIRED`, `RANDOM` = tiré.

**Erreurs** : `404` (session inconnue), `400` (`:id` non-UUID)

### `POST /pairing-sessions/:id/validate`

Vérifie la configuration **avant** de tirer. **Aucun body.**

**`200` → `ValidationReport`** (toujours `200`, même si invalide — c'est un
diagnostic, pas une erreur)

```ts
interface ValidationReport {
  valid: boolean;
  issues: { code: ErrorCode; message: string }[];
  stats: {
    sponsors: number;      // nb de ING4
    mentees: number;       // nb de ING3
    totalCapacity: number; // somme des maxMentees
    required: number;      // nb de contraintes REQUIRED
    forbidden: number;     // nb de contraintes FORBIDDEN
  };
}
```

```json
{
  "valid": true,
  "issues": [],
  "stats": { "sponsors": 4, "mentees": 8, "totalCapacity": 10, "required": 1, "forbidden": 0 }
}
```

En cas de problème, `issues` contient une entrée par anomalie — **afficher la
liste à l'utilisateur plutôt qu'un message générique** :

```json
{
  "valid": false,
  "issues": [
    { "code": "NOT_ENOUGH_MENTEES", "message": "Il faut au moins autant de filleuls (5) que de parrains (6)" },
    { "code": "INSUFFICIENT_TOTAL_CAPACITY", "message": "Capacité totale insuffisante : 4 pour 9 filleul(s)" }
  ]
}
```

**`ErrorCode` possibles** : `NO_MENTEES`, `NO_SPONSORS`, `NOT_ENOUGH_MENTEES`,
`INVALID_CAPACITY`, `INSUFFICIENT_TOTAL_CAPACITY`, `INVALID_SPONSOR`,
`INVALID_MENTEE`, `DUPLICATE_REQUIRED_MENTEE`, `REQUIRED_CAPACITY_EXCEEDED`,
`REQUIRED_PAIRING_CONFLICT`, `NO_VALID_PAIRING_FOUND`.

### `POST /pairing-sessions/:id/generate`

Lance le tirage. **Aucun body.** **`201` → `PairingSessionView`**.

Règles appliquées : tous les parrains obtiennent au moins un filleul, les
capacités `maxMentees` sont respectées, les couples `REQUIRED` sont appliqués
en premier, les couples `FORBIDDEN` sont exclus. La distribution se fait par
vagues successives (1 filleul par parrain, puis 2, puis 3…).

**Erreurs**

| Code | `code` | Cas |
|---|---|---|
| `400` | `*ErrorCode*` | configuration invalide — le body contient `issues` |
| `400` | `SESSION_FINALIZED` | la session est déjà finalisée |

```json
{
  "code": "INSUFFICIENT_TOTAL_CAPACITY",
  "message": "Capacité totale insuffisante : 4 pour 9 filleul(s)",
  "issues": [ … ]
}
```

### `POST /pairing-sessions/:id/regenerate`

Relance un nouveau tirage. **Aucun body.** **`201` → `PairingSessionView`**.

L'opération est atomique : un échec ne laisse jamais de couples partiels en base.
Les couples `REQUIRED` restent identiques, le reste change.

**Erreurs**

| `code` | Cas |
|---|---|
| `SESSION_FINALIZED` | session finalisée — **bouton « Régénérer » à masquer** |
| `SESSION_NOT_GENERATED` | session en `DRAFT`, rien à régénérer |

### `POST /pairing-sessions/:id/finalize`

Fige la session. **Aucun body.** **`201` → `PairingSessionView`** (`status: "FINALIZED"`).

Après finalisation : ni `generate`, ni `regenerate`, ni modification des
contraintes ne modifient plus le résultat. L'export devient possible.

**Erreurs** : `SESSION_NOT_GENERATED` si la session est encore en `DRAFT`.

---

## 6. Export XLSX

### `GET /pairing-sessions/:id/export`

Télécharge le résultat de la session **finalisée**. **Aucun body.**

**`200`** — réponse binaire, pas du JSON.

| En-tête | Valeur |
|---|---|
| `Content-Type` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `Content-Disposition` | `attachment; filename="parrainage-<id>.xlsx"` |

Une feuille, une ligne par couple (un parrain avec plusieurs filleuls apparaît
sur plusieurs lignes) :

| Parrain | Email parrain | WhatsApp parrain | Matricule parrain | Filleul | Email filleul | WhatsApp filleul | Matricule filleul |
|---|---|---|---|---|---|---|---|
| Paul Durand | paul.durand@school.fr | +33612345678 | M1001 | Alice Bernard | alice.bernard@school.fr | +33612345678 | M2001 |

> `origin` / `PRECONFIGURED` n'apparaissent **pas** dans le fichier.
> **Côté front** : envoyer un `fetch` puis `blob` → téléchargement, ou pointer
> directement un `<a href>`. Ne pas utiliser une requête avec header `Accept:
> application/json`.

**Erreurs** : `400` `Seule une session finalisée peut être exportée` · `404`

---

## 7. Format des erreurs

Deux formats coexistent. Le second (`{ code, message }`) est réservé aux
**règles métier** et permet au front de brancher un message dédié.

### Erreur standard Nest

```json
{ "message": "Étudiant introuvable : <id>", "error": "Not Found", "statusCode": 404 }
```

Pour une erreur de validation, `message` est un **tableau de chaînes** :

```json
{
  "message": [
    "sponsorId must be a UUID",
    "menteeId must be a UUID",
    "type must be one of the following values: REQUIRED, FORBIDDEN"
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

### Erreur métier

```json
{ "code": "INVALID_SPONSOR", "message": "Le parrain doit être un ING4" }
```

ou, pour la génération, avec le détail des anomalies :

```json
{ "code": "NO_VALID_PAIRING_FOUND", "message": "…", "issues": [ { "code": "…", "message": "…" } ] }
```

> Les `message` métier sont en français et directement affichables.

### Codes utilisés

| HTTP | `error` | Quand |
|---|---|---|
| `400` | `Bad Request` | validation du payload, UUID mal formé, champ interdit |
| `404` | `Not Found` | étudiant, session ou token inexistant |
| `409` | `Conflict` | contrainte existante, couple déjà défini |
| `410` | `Gone` | invitation utilisée, expirée ou annulée |

### Validation automatique

Un `ValidationPipe` global est actif avec `whitelist` et
`forbidNonWhitelisted` : **tout champ non documenté ci-dessus est refusé en
`400`**. Utile pour attraper un `{ email }` glissé dans un `PATCH`.

---

## Parcours d'intégration recommandé

```
1. POST /students/import                 importer ING3 + ING4
2. GET  /students?level=ING4             lister les parrains
3. PATCH /students/:id  {maxMentees}     fixer les capacités
4. POST /students/:id/invitations        envoyer les liens de profil
5. GET  /invitations/verify?token=…      (côté étudiant) afficher le formulaire
6. POST /invitations/complete            (côté étudiant) photo + WhatsApp
7. POST /pairing-constraints             couples REQUIRED / FORBIDDEN
8. POST /pairing-sessions/:id/validate   vérifier avant de tirer
9. POST /pairing-sessions/:id/generate   tirer
10. POST /pairing-sessions/:id/regenerate  tant que ça ne convient pas
11. POST /pairing-sessions/:id/finalize  figer
12. GET  /pairing-sessions/:id/export    télécharger le XLSX
```

---

## Sécurité

L'API **n'a aucune authentification** : elle est prévue pour un réseau interne
ou derrière un proxy qui la protège.

Avant toute mise en ligne, il faut ajouter au minimum :

- une authentification administrateur sur les endpoints d'écriture
  (`PATCH /students/:id`, import, invitations, contraintes, sessions, export) ;
- un rate limiting sur `POST /invitations/complete` (le token est le seul
  facteur, il est à usage unique mais devinable en théorie) ;
- le retrait des invites `GET /pairings-constraints` et `GET /pairing-sessions/:id`
  de toute exposition publique : ils contiennent les emails de tous les étudiants.

Les tokens d'invitation sont en revanche déjà sécurisés : générés par
`crypto.randomBytes(32)`, stockés **uniquement sous forme de hash SHA-256**,
à usage unique, et expirables via `PROFILE_INVITATION_EXPIRATION_HOURS`.
