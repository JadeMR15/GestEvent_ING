import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronDown, Mail } from "lucide-react";
import { PublicPage, LegalSection } from "@/components/PublicPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const Route = createFileRoute("/aide")({
  component: AidePage,
  head: () => ({ meta: [{ title: "Aide — Plav'" }] }),
});

function Question({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-bordure bg-white/70 open:bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 font-semibold text-encre [&::-webkit-details-marker]:hidden">
        {q}
        <ChevronDown className="h-4 w-4 shrink-0 text-bordeaux-600 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 px-4 pb-4">{children}</div>
    </details>
  );
}

function AidePage() {
  const mail = <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <PublicPage
      title="Aide"
      intro={<p>Les réponses aux questions qu'on nous pose le plus. Pas trouvé ? Écris-nous à {mail}.</p>}
    >
      <LegalSection title="Mon compte">
        <div className="space-y-3">
          <Question q="Comment vérifier mon compte étudiant ?">
            <p>Va dans <strong>Vérifier mon compte</strong>. Deux possibilités :</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Ton adresse email d'école</strong> (la plus rapide) : tu reçois un lien, un clic et c'est fait.</li>
              <li><strong>Un justificatif</strong> : certificat de scolarité ou carte étudiante de cette année. Il est supprimé dès la décision.</li>
            </ul>
            <p>La vérification est valable jusqu'au 31 août, puis il faut la refaire.</p>
          </Question>
          <Question q="Mon école n'est pas reconnue, que faire ?">
            <p>
              Entre quand même ton adresse d'école : une demande d'ajout part à l'équipe Plav'. En attendant, tu peux te
              vérifier avec un justificatif.
            </p>
          </Question>
          <Question q="Je n'ai pas reçu l'email (confirmation, lien d'école, mot de passe)">
            <ul className="list-disc space-y-1 pl-5">
              <li>Attends quelques minutes, puis regarde dans le <strong>courrier indésirable</strong>.</li>
              <li>Sur Outlook (adresses d'école), regarde aussi l'onglet <strong>« Autres »</strong>.</li>
              <li>Les emails partent de <strong>noreply@plav.fr</strong> : ajoute-la à tes contacts.</li>
              <li>Toujours rien ? Redemande l'email, puis écris-nous à {mail}.</li>
            </ul>
          </Question>
          <Question q="J'ai oublié mon mot de passe">
            <p>
              Sur la page de connexion, clique sur <Link to="/mot-de-passe-oublie" className="underline">Mot de passe oublié</Link>.
              Tu reçois un lien pour en choisir un nouveau.
            </p>
          </Question>
          <Question q="Comment supprimer mon compte ou récupérer mes données ?">
            <p>
              Dans <strong>Paramètres → Mes données</strong> : « Télécharger mes données » pour en avoir une copie,
              « Supprimer mon compte » pour tout effacer. Plus de détails dans la{" "}
              <Link to="/confidentialite" className="underline">politique de confidentialité</Link>.
            </p>
          </Question>
        </div>
      </LegalSection>

      <LegalSection title="Billets et événements">
        <div className="space-y-3">
          <Question q="Comment réserver une place ?">
            <p>
              Ouvre l'événement, choisis le nombre de places puis valide. La place est bloquée quelques minutes le temps de
              confirmer ; ton billet arrive ensuite dans <strong>Mes billets</strong> et par email.
            </p>
          </Question>
          <Question q="Comment marche la liste d'attente ?">
            <ul className="list-disc space-y-1 pl-5">
              <li>Sur un événement complet, clique sur <strong>Rejoindre la liste d'attente</strong> : tu vois ta position.</li>
              <li>Quand une place se libère, elle est proposée <strong>dans l'ordre d'arrivée</strong> : tu reçois un email et une notification.</li>
              <li>Elle t'est réservée <strong>2 heures</strong> (<strong>15 minutes</strong> si l'événement commence dans moins de 24 h). Sans réponse, elle passe à la personne suivante.</li>
              <li>Retrouve tes listes dans <strong>Listes d'attente</strong>.</li>
            </ul>
          </Question>
          <Question q="Comment annuler ma place ?">
            <p>
              Sur la page de l'événement ou dans <strong>Mes billets</strong>, clique sur « Annuler ». La place est aussitôt
              proposée à la liste d'attente. Pour un événement payant, le remboursement dépend de l'association organisatrice.
            </p>
          </Question>
          <Question q="Comment ajouter un événement à mon agenda ?">
            <p>Sur la page de l'événement, clique sur <strong>Ajouter à mon agenda</strong> : Google Agenda, ou un fichier pour Apple Calendrier et Outlook.</p>
          </Question>
          <Question q="Une photo de moi a été publiée et je veux la retirer">
            <p>Demande-le à l'association organisatrice, ou écris-nous à {mail} avec le lien de l'album.</p>
          </Question>
        </div>
      </LegalSection>

      <LegalSection title="Associations et organisateurs">
        <div className="space-y-3">
          <Question q="Comment devenir organisateur ?">
            <p>
              Crée un compte en choisissant « Organisateur » et ton association. Ton école valide ta demande ; tu peux ensuite
              créer des événements, qui sont aussi validés par l'école avant d'être visibles.
            </p>
          </Question>
          <Question q="Mon école n'utilise pas encore Plav'">
            <p>
              Un représentant de l'école peut l'inscrire depuis la page{" "}
              <Link to="/register-school" className="underline">Inscrire mon école</Link>.
            </p>
          </Question>
        </div>
      </LegalSection>

      <div className="rounded-2xl border border-bordure bg-creme p-5">
        <p className="font-semibold text-bordeaux-800">Besoin d'aide ?</p>
        <a href={`mailto:${CONTACT_EMAIL}`} className="mt-2 inline-flex items-center gap-2 underline">
          <Mail className="h-4 w-4" />{CONTACT_EMAIL}
        </a>
      </div>
    </PublicPage>
  );
}
