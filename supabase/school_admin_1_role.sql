-- ============================================================
-- Espace administration des écoles — ÉTAPE 1 / 2 (2026-11-13)
-- À lancer seul dans Supabase > SQL Editor, AVANT school_admin_2.sql.
-- (Postgres refuse d'utiliser une nouvelle valeur d'enum dans la même
--  exécution que celle qui la crée.)
-- ============================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'school_admin';
