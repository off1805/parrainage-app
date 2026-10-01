# Parrainage — Front

Vite + React + TypeScript. Spectacle de révélation (`/show`), télécommande iPhone (`/remote`), mode démo (`/show?demo=1`).

## Lancer
```bash
npm install
cp .env.example .env   # renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

## Jour J
1. Backend lancé, session générée (`generate`). Le front prend la dernière session non-DRAFT, ou `?session=<id>`.
2. Ouvre **http://localhost:5173/show** sur le PC (le CORS du backend n'autorise que `FRONTEND_URL`, localhost par défaut).
3. Clique « Lever le rideau » (débloque le son + plein écran). Le lien de télécommande est affiché.
4. Sur l'iPhone, ouvre `http://<IP-du-PC>:5173/remote?room=<code>` (même wifi / partage de connexion). La télécommande ne touche pas au backend, seulement à Supabase Realtime.
5. Son : place ton fichier dans `public/audio/ambiance.mp3`. Le carillon est généré, pas besoin de fichier.

## Répéter
`/show?demo=1` : 10 faux couples sans photo (monogrammes), parrains à 3/2/2/1/1/1 filleuls.
