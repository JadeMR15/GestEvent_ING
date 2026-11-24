import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage, LegalSection, ToFill } from "@/components/PublicPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const Route = createFileRoute("/mentions-legales")({
  component: MentionsLegalesPage,
  head: () => ({ meta: [{ title: "Mentions légales — Plav'" }] }),
});

// Contenu tiré du dossier de conformité RGPD de Plav'. Les passages surlignés
// ([…]) sont à compléter par l'équipe dès que la structure juridique existe.
function MentionsLegalesPage() {
  return (
    <PublicPage title="Mentions légales" updated="24 novembre 2026">
      <LegalSection title="Éditeur du site">
        <p>
          Le site Plav' et l'application Plav' sont édités par <ToFill>nom de la structure</ToFill>,{" "}
          <ToFill>forme juridique : association loi 1901 ou société</ToFill>, dont le siège est situé{" "}
          <ToFill>adresse du siège</ToFill>.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Numéro d'identification : <ToFill>RNA (association) ou SIREN (société)</ToFill></li>
          <li>Directeur ou directrice de la publication : <ToFill>nom</ToFill></li>
          <li>Contact : <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
        </ul>
      </LegalSection>

      <LegalSection title="Hébergement">
        <ul className="list-disc space-y-1 pl-5">
          <li>Site : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis — vercel.com</li>
          <li>Base de données, comptes et fichiers : Supabase Inc. — supabase.com</li>
          <li>Nom de domaine plav.fr : OVH SAS, 2 rue Kellermann, 59100 Roubaix, France</li>
        </ul>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p>
          Le nom Plav', le logo, la mascotte Cocotte, la charte graphique et les contenus du site sont la propriété de
          leurs auteurs. Toute reproduction sans autorisation est interdite. Les photos et textes publiés par les
          associations restent sous leur responsabilité.
        </p>
      </LegalSection>

      <LegalSection title="Données personnelles">
        <p>
          Le traitement de tes données est décrit dans la{" "}
          <Link to="/confidentialite" className="underline">politique de confidentialité</Link>. Les règles d'utilisation
          du service sont dans les <Link to="/cgu" className="underline">conditions générales d'utilisation</Link>.
        </p>
      </LegalSection>
    </PublicPage>
  );
}
