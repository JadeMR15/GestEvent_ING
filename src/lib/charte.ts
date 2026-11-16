// Valeurs de la charte pour les endroits où une variable CSS ne peut pas servir :
// graphiques (attributs SVG de recharts) et billet imprimable (fenêtre séparée).
// Copie exacte de plav-tokens.css : toute modification se fait d'abord là-bas.
export const CHARTE = {
  bordeaux100: "#E9DDE0",
  bordeaux200: "#D3BAC1",
  bordeaux300: "#B58C98",
  bordeaux400: "#975F6E",
  bordeaux500: "#803A4D",
  bordeaux600: "#6D1D30",
  bordeaux700: "#571627",
  bordeaux800: "#42111E",
  bordeaux900: "#310D17",
  jaune100: "#F7E7C2",
  jaune200: "#F0D28C",
  jaune300: "#E8B332",
  jaune400: "#C69429",
  jaune500: "#9D7322",
  blanc: "#FFFFFF",
  creme: "#F9F4E8",
  sable: "#EBE4D7",
  fond: "#FFFFFF",    // ESSAI design-tests (--neutre-fond)
  bordure: "#E9E0E3", // ESSAI design-tests (--neutre-bordure)
  grisChaud: "#7A6960",
  encre: "#2B161B",
  ombreCarte: "0 4px 16px rgba(109, 29, 48, 0.08)",
  ombreMenu: "0 8px 24px rgba(109, 29, 48, 0.12)",
  fontTitre: '"Nunito", system-ui, sans-serif',
  fontTexte: '"Nunito Sans", system-ui, sans-serif',
  fontsUrl: "https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Nunito+Sans:wght@400;500;600;700&display=swap",
} as const;
