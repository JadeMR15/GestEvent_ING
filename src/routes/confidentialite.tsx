import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicPage, LegalSection, ToFill } from "@/components/PublicPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const Route = createFileRoute("/confidentialite")({
  component: ConfidentialitePage,
  head: () => ({ meta: [{ title: "Politique de confidentialité — Plav'" }] }),
});

// Contenu tiré du « Dossier de conformité RGPD » de Plav' (registre des traitements,
// durées proposées, sous-traitants, droits). Les durées sont des propositions à faire
// valider par le DPO de l'école ou un juriste ; les passages [ … ] sont à compléter.
const TRAITEMENTS: [string, string, string, string][] = [
  ["Ton compte", "Nom, prénom, email, mot de passe chiffré, école, date de naissance, genre (facultatif), photo (associations et écoles), identifiant Google ou Apple", "Exécution du contrat (CGU)", "Tant que le compte est actif ; supprimé après 3 ans d'inactivité, avec un email de prévenance"],
  ["Vérification du statut étudiant", "Email d'école, justificatif (certificat de scolarité ou carte étudiante), résultat, date, motif de refus", "Exécution du contrat (service réservé aux étudiants)", "Justificatif supprimé dès la décision ; résultat conservé tant que le compte existe"],
  ["Billets et inscriptions", "Identité du participant, tarif, places, amis inscrits, statut, document demandé par l'organisateur", "Exécution du contrat", "12 mois après l'événement, puis anonymisation pour les statistiques"],
  ["Liste d'attente", "Position, date d'inscription, offres envoyées", "Exécution du contrat", "Supprimée à la fin de l'événement"],
  ["Contrôle d'accès le jour J", "QR code, heure d'entrée, personne qui scanne, photo affichée au scan", "Intérêt légitime (sécurité de l'événement)", "6 mois après l'événement"],
  ["Bénévoles", "Lien d'accès, nom ou email saisi par l'organisateur, scans effectués", "Intérêt légitime de l'association", "Lien désactivé après l'événement ; données supprimées avec l'historique"],
  ["Emails et notifications", "Email, jeton de notification, historique des envois", "Exécution du contrat ; accord du navigateur pour les notifications push", "Historique : 12 mois"],
  ["Abonnements, likes, actualités", "Associations suivies, événements likés, lectures", "Exécution du contrat (choix de l'étudiant)", "Jusqu'au désabonnement ou à la suppression du compte"],
  ["Albums photo", "Photos des soirées, téléchargements", "Intérêt légitime de l'association, avec droit d'opposition et retrait sur demande", "12 mois après l'événement, sauf choix contraire de l'association"],
  ["Statistiques", "Âge, genre, école, présence, remplissage", "Intérêt légitime (pilotage)", "Affichées seulement de façon agrégée ; données sources selon les durées ci-dessus"],
  ["Espace école et messagerie", "Membres, décisions de validation, messages école-association", "Exécution du contrat avec l'école", "Durée du contrat avec l'école ; messages : 3 ans"],
  ["Modération et sécurité", "Blocages et leur motif, changements de rôle, journaux de connexion", "Intérêt légitime", "Journaux : 1 an ; blocages : durée du blocage + 1 an"],
  ["Support", "Coordonnées, contenu des échanges", "Intérêt légitime", "3 ans après le dernier contact"],
];

const SOUS_TRAITANTS: [string, string, string][] = [
  ["Supabase", "Base de données, comptes, stockage des fichiers", "Accord de sous-traitance avec clauses contractuelles types"],
  ["Vercel", "Hébergement du site", "Certifié Data Privacy Framework ; accord de sous-traitance"],
  ["Brevo", "Envoi des emails (confirmations, billets, liste d'attente)", "Entreprise française, données dans l'Union européenne"],
  ["Google, Apple", "Connexion avec un compte Google ou Apple (si tu la choisis)", "Responsables indépendants, selon leurs propres politiques"],
  ["OpenStreetMap", "Fonds de la carte des événements", "Ton adresse IP est transmise au serveur de cartes quand la carte s'affiche"],
  ["YouTube, Vimeo", "Vidéos ajoutées par les organisateurs", "Responsables indépendants, selon leurs propres politiques"],
];

function ConfidentialitePage() {
  const mail = <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <PublicPage
      title="Politique de confidentialité"
      updated="24 novembre 2026"
      intro={<p>Cette page explique quelles données Plav' utilise, pourquoi, combien de temps, et comment exercer tes droits.</p>}
    >
      <LegalSection title="Qui est responsable de tes données">
        <p>
          <ToFill>nom de la structure</ToFill>, éditrice de Plav', est responsable des traitements liés à ton compte et à la
          vérification de ton statut étudiant. Pour les inscriptions à un événement, l'association organisatrice (BDE, BDS…)
          est responsable de l'usage des données de ses participants ; Plav' agit pour son compte. Ton école est responsable
          du suivi de ses associations dans son espace.
        </p>
        <p>Contact pour toute question sur tes données : {mail}.</p>
      </LegalSection>

      <LegalSection title="Ce que nous utilisons, pourquoi et combien de temps">
        <div className="overflow-x-auto rounded-xl border border-bordure">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-creme text-bordeaux-800">
              <tr>
                <th className="p-3 font-semibold">Pour quoi</th>
                <th className="p-3 font-semibold">Données</th>
                <th className="p-3 font-semibold">Base légale</th>
                <th className="p-3 font-semibold">Durée de conservation</th>
              </tr>
            </thead>
            <tbody>
              {TRAITEMENTS.map(([quoi, donnees, base, duree]) => (
                <tr key={quoi} className="border-t border-bordure align-top">
                  <td className="p-3 font-medium">{quoi}</td>
                  <td className="p-3">{donnees}</td>
                  <td className="p-3">{base}</td>
                  <td className="p-3">{duree}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>Les pièces comptables liées aux paiements sont conservées 10 ans (obligation légale).</p>
      </LegalSection>

      <LegalSection title="Justificatifs étudiants">
        <ul className="list-disc space-y-1 pl-5">
          <li>Nous demandons un certificat de scolarité ou une carte étudiante, jamais une pièce d'identité.</li>
          <li>Masque les informations inutiles (numéro de sécurité sociale, adresse) avant l'envoi.</li>
          <li>Le document est stocké dans un espace privé et <strong>supprimé dès la décision</strong> ; seul le résultat est gardé.</li>
          <li>La vérification automatique est relue par une personne en cas de doute, et chaque refus est expliqué.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Photos des soirées">
        <p>
          Des photos peuvent être prises pendant les événements et publiées dans l'album de la soirée. Si tu es reconnaissable
          sur une photo, tu peux demander son retrait à l'association organisatrice ou en écrivant à {mail}.
        </p>
      </LegalSection>

      <LegalSection title="Qui reçoit tes données">
        <p>
          L'association organisatrice reçoit les informations utiles à ton billet et à ton entrée. Ton école voit la liste de
          ses membres et des chiffres agrégés. Plav' s'appuie sur ces prestataires :
        </p>
        <div className="overflow-x-auto rounded-xl border border-bordure">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-creme text-bordeaux-800">
              <tr>
                <th className="p-3 font-semibold">Prestataire</th>
                <th className="p-3 font-semibold">Usage</th>
                <th className="p-3 font-semibold">Garanties</th>
              </tr>
            </thead>
            <tbody>
              {SOUS_TRAITANTS.map(([nom, usage, garanties]) => (
                <tr key={nom} className="border-t border-bordure align-top">
                  <td className="p-3 font-medium">{nom}</td>
                  <td className="p-3">{usage}</td>
                  <td className="p-3">{garanties}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Certains prestataires sont des entreprises américaines. Les transferts éventuels hors de l'Union européenne sont
          encadrés par le Data Privacy Framework ou par les clauses contractuelles types de la Commission européenne.
          Nous ne vendons jamais tes données.
        </p>
      </LegalSection>

      <LegalSection title="Tes droits">
        <p>Tu peux à tout moment, gratuitement :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>accéder</strong> à tes données et les <strong>récupérer</strong> (Paramètres → Mes données → Télécharger mes données) ;</li>
          <li>les <strong>corriger</strong> dans tes paramètres ;</li>
          <li>les <strong>supprimer</strong> (Paramètres → Mes données → Supprimer mon compte) ;</li>
          <li>t'<strong>opposer</strong> à un traitement (retrait d'une photo, désabonnement, arrêt des notifications) ;</li>
          <li>demander la <strong>limitation</strong> d'un traitement le temps d'une contestation ;</li>
          <li>donner des directives sur le sort de tes données après ton décès.</li>
        </ul>
        <p>
          Écris à {mail} depuis l'adresse de ton compte. Nous répondons sous un mois. Si tu n'es pas satisfait(e) de la
          réponse, tu peux saisir la CNIL (cnil.fr).
        </p>
      </LegalSection>

      <LegalSection title="Sécurité">
        <p>
          Les échanges sont chiffrés (HTTPS), les mots de passe ne sont jamais stockés en clair, chaque rôle (étudiant,
          organisateur, école, équipe Plav') n'accède qu'aux données nécessaires, et les justificatifs sont dans un espace
          privé avec des liens temporaires. En cas de violation de données, nous prévenons la CNIL sous 72 heures et, si le
          risque est élevé, les personnes concernées.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Plav' n'utilise que des cookies et un stockage local indispensables au fonctionnement : rester connecté(e),
          garder ta réservation en cours, sécurité. Ils ne demandent pas ton accord. Aucun outil publicitaire n'est utilisé.
          Les vidéos YouTube ou Vimeo ajoutées par les organisateurs et la carte peuvent contacter leurs serveurs quand elles
          s'affichent.
        </p>
      </LegalSection>

      <LegalSection title="Mineurs">
        <p>
          Plav' s'adresse aux étudiants, dont certains peuvent avoir moins de 18 ans. Les règles qui s'appliquent sont dans
          les <Link to="/cgu" className="underline">conditions générales d'utilisation</Link>.
        </p>
      </LegalSection>
    </PublicPage>
  );
}
