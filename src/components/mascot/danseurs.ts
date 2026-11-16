/**
 * Les créatrices de Plav' qui dansent avec Cocotte (ESSAI design-tests).
 * Liste fixe : aucune requête, aucune association, aucun logo.
 * Photos carrées recadrées sur le visage, dans public/equipe/ (non modifiées).
 */
export type DanseurConfig = { prenom: string; photo: string };

export const DANSEURS: DanseurConfig[] = [
  { prenom: "Olivia", photo: "/equipe/createrice-1.webp" },
  { prenom: "Jade", photo: "/equipe/createrice-2.webp" },
  { prenom: "Mélissa", photo: "/equipe/createrice-3.webp" },
];
