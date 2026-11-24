// Coordonnées publiques de Plav', à un seul endroit.
// support@plav.app ne recevait rien (le domaine plav.app n'a pas de serveur mail).
// Quand le site passera sur plav.fr : créer contact@plav.fr en redirection OVH vers
// cette adresse, puis la remplacer ici.
export const CONTACT_EMAIL = "plav.billet@gmail.com";

/**
 * Lien de téléchargement de l'application. Tant que l'app n'est pas publiée sur l'App Store,
 * il mène à la section « application » de l'accueil ; remplacer par le lien App Store
 * (https://apps.apple.com/…) dès la publication.
 */
export const APP_DOWNLOAD_URL = "/#application";

/** Liens vers les sections de présentation de l'accueil. */
export const DISCOVER_LINKS = [
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#lp-how-title", label: "Comment ça marche" },
  { href: APP_DOWNLOAD_URL, label: "Télécharger l'application" },
] as const;

/** Pages légales et d'aide, liées depuis tous les pieds de page. */
export const LEGAL_LINKS = [
  { to: "/aide", label: "Aide / FAQ" },
  { to: "/mentions-legales", label: "Mentions légales" },
  { to: "/cgu", label: "CGU" },
  { to: "/confidentialite", label: "Confidentialité" },
] as const;
