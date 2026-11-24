// Adresse du site en ligne. Les liens envoyés par email pointent toujours ici, même quand
// on teste en local : une adresse localhost serait inaccessible pour les antivirus de
// messagerie, qui bloqueraient alors l'email.
//
// Passage sur plav.fr : une fois le domaine branché dans Vercel, définir la variable
// VITE_SITE_URL=https://plav.fr (Vercel → Settings → Environment Variables) et le secret
// SITE_URL=https://plav.fr des fonctions Supabase. Aucune autre ligne de code à changer.
export const SITE_URL = ((import.meta.env.VITE_SITE_URL as string | undefined) || "https://plavv.vercel.app").replace(/\/$/, "");
