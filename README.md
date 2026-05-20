# Plav'

Application web de gestion d'événements — créer des events, gérer les inscriptions, scanner les billets, suivre les finances et les bénévoles.

## Stack

React + Supabase, déployé sur Vercel.

## Fonctionnalités

- Création et gestion d'événements
- Inscription participants + liste d'attente
- Scan QR code des billets
- Gestion des bénévoles
- Tableau de bord analytics
- Suivi des finances
- Export des données
- Vue publique des events (partage sans compte)

## Lancer en local

```bash
bun install
bun dev
```

## Build

```bash
bun run build
```

Le build CSR (pour Vercel) utilise `vite.csr.config.ts` :

```bash
bun vite build --config vite.csr.config.ts
```

## Variables d'environnement

Créer un fichier `.env.local` à la racine :

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Base de données

Les migrations Supabase sont dans `supabase/migrations/`.
