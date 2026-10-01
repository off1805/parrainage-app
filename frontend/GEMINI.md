# Projet : Parrainage (front)
Application web de révélation de parrains (ING4) à leurs filleuls (ING3), projetée en salle le samedi 3 octobre 2026, avec une page d'invitation pour les cadets et un espace admin.

## Périmètre
- Par défaut, tu travailles uniquement dans frontend/. Tu ne modifies le backend (src/, test/ à la racine) que si la tâche est explicitement marquée « BACKEND ». Sinon, signale le besoin dans ta réponse au lieu de le faire.

## Stack
Vite + React 18 + TypeScript strict, react-router-dom, framer-motion, CSS maison (src/styles.css, variables --ivory --sand --plum --gold), @supabase/supabase-js (photos et télécommande). Pas de Tailwind, pas de bibliothèque de composants. Toute nouvelle dépendance doit être justifiée avant installation.

## Conventions
- Interface en français, identifiants du code en anglais.
- Tout appel à l'API passe par src/lib/api.ts (aucun fetch dans les composants). Une erreur est une ApiError (status, code, issues) : afficher error.message.
- Design : fond ivoire, accent prune #7B1E4D, filets or #B39058, jamais de fond sombre. Titres Cormorant Garamond, texte Jost, accents Pinyon Script.
- Photo manquante ou cassée : toujours le monogramme (composant Portrait).
- Clé admin (en-tête X-API-Key) : saisie par l'utilisateur à l'ouverture de /admin, gardée en sessionStorage, jamais dans .env ni dans le code.
- Jamais de données d'étudiants dans localStorage.

## Pièges de l'API
- POST /students/:id/invitations renvoie 201 même si l'email échoue : lire email.failed.
- POST /pairing-sessions/:id/validate renvoie toujours 200 : lire valid.
- Le champ message d'une erreur peut être un tableau de chaînes.
- L'export XLSX est binaire : fetch puis blob.

## Façon de travailler (économie de quota)
- Ne lis que les fichiers nécessaires à la tâche, n'explore pas le dépôt.
- Ne modifie que les fichiers cités dans la tâche ; dis-moi si un autre doit changer.
- Avant de conclure : npm run build doit passer.
- Réponse finale courte : fichiers modifiés, ce qui n'a pas pu être fait. Pas de documentation non demandée.
