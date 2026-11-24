import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage, LegalSection, ToFill } from "@/components/PublicPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const Route = createFileRoute("/cgu")({
  component: CguPage,
  head: () => ({ meta: [{ title: "Conditions générales d'utilisation — Plav'" }] }),
});

// Base de travail tirée du dossier de conformité RGPD (règles d'usage, modération,
// blocage, mineurs, photos). À faire relire avant la mise en production.
function CguPage() {
  const mail = <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <PublicPage
      title="Conditions générales d'utilisation"
      updated="24 novembre 2026"
      intro={<p>En créant un compte sur Plav', tu acceptes ces conditions. Elles sont écrites simplement : lis-les, ça prend cinq minutes.</p>}
    >
      <LegalSection title="1. Le service">
        <p>
          Plav' est une billetterie pour les événements des associations étudiantes, éditée par{" "}
          <ToFill>nom de la structure</ToFill>. Elle permet de découvrir des événements, de réserver des places, de rejoindre
          une liste d'attente, de suivre des associations et, pour les organisateurs, de gérer leurs événements, leurs
          billets, leurs bénévoles et leurs albums photo.
        </p>
      </LegalSection>

      <LegalSection title="2. Ton compte">
        <ul className="list-disc space-y-1 pl-5">
          <li>Les informations que tu donnes doivent être exactes ; ton compte est personnel, ne le prête pas.</li>
          <li>Garde ton mot de passe secret. Si tu penses qu'il a été découvert, change-le et préviens-nous.</li>
          <li>Certains événements sont réservés aux étudiants vérifiés : la vérification se fait par email d'école ou par justificatif.</li>
          <li>Tu peux supprimer ton compte à tout moment depuis tes paramètres.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Billets et inscriptions">
        <ul className="list-disc space-y-1 pl-5">
          <li>Un billet est nominatif. Le QR code ne doit pas être partagé : il est vérifié à l'entrée, avec ta photo si l'organisateur l'utilise.</li>
          <li>Une réservation non confirmée est libérée au bout de quelques minutes.</li>
          <li>Sur liste d'attente, une place libérée t'est réservée pour un temps limité ; sans réponse, elle passe à la personne suivante.</li>
          <li>L'événement est organisé sous la seule responsabilité de l'association : programme, lieu, sécurité, remboursement éventuel.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Règles de bonne conduite">
        <p>Il est interdit de :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>publier des contenus illégaux, haineux, discriminants, violents ou portant atteinte à la vie privée d'autrui ;</li>
          <li>usurper l'identité d'une personne, d'une école ou d'une association ;</li>
          <li>envoyer un faux justificatif ou contourner la vérification étudiante ;</li>
          <li>revendre des billets, les dupliquer ou tenter d'entrer avec le billet d'un autre ;</li>
          <li>perturber le service (robots, collecte automatisée, tentative d'accès aux données d'autres utilisateurs).</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Organisateurs et associations">
        <p>
          Les organisateurs sont validés par leur école. Ils utilisent les données de leurs participants uniquement pour leurs
          événements, respectent le droit à l'image dans leurs albums et ne demandent un document (carte étudiante, pièce
          d'identité) que s'il est vraiment nécessaire. Des conditions organisateurs détaillent ces engagements{" "}
          <ToFill>à rédiger</ToFill>.
        </p>
      </LegalSection>

      <LegalSection title="6. Photos">
        <p>
          Des photos peuvent être prises pendant les soirées et publiées dans l'album de l'événement. Toute personne
          reconnaissable peut demander le retrait d'une photo à l'association, ou à Plav' en écrivant à {mail}.
        </p>
      </LegalSection>

      <LegalSection title="7. Mineurs">
        <p>
          Plav' est ouvert aux étudiants, y compris aux étudiants de moins de 18 ans. Les organisateurs restent responsables
          du respect de la loi pendant leurs événements, notamment l'interdiction de vendre ou d'offrir de l'alcool aux
          mineurs, et peuvent réserver un événement aux personnes majeures.
        </p>
      </LegalSection>

      <LegalSection title="8. Modération et blocage">
        <p>
          L'équipe Plav' et les écoles peuvent retirer un contenu qui ne respecte pas ces règles, et suspendre ou bloquer un
          compte, toujours avec un motif. Tu peux contester une décision en écrivant à {mail}.
        </p>
      </LegalSection>

      <LegalSection title="9. Responsabilité">
        <p>
          Nous faisons de notre mieux pour que Plav' fonctionne sans interruption, sans pouvoir le garantir. Plav' n'est pas
          l'organisateur des événements et n'est pas responsable de leur déroulement.
        </p>
      </LegalSection>

      <LegalSection title="10. Données personnelles">
        <p>
          L'usage de tes données est expliqué dans la{" "}
          <Link to="/confidentialite" className="underline">politique de confidentialité</Link>.
        </p>
      </LegalSection>

      <LegalSection title="11. Modifications et droit applicable">
        <p>
          Ces conditions peuvent évoluer ; tu seras prévenu(e) des changements importants. Elles sont soumises au droit
          français. En cas de litige, une solution amiable est recherchée en priorité.
        </p>
      </LegalSection>
    </PublicPage>
  );
}
