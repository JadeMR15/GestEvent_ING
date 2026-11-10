import { useEffect, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { CheckCircle2, Clock, GraduationCap, Loader2, MailCheck, Send, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type EmailClassification, type SchoolDomainRequest,
  KIND_HINT, classifyEmail, db, requestSchoolEmailLink,
} from "@/lib/school-email";

/**
 * Saisie de l'adresse d'école : lien de confirmation si le domaine est connu,
 * demande d'ajout aux admins sinon. L'adresse perso du compte ne change pas.
 */
export function SchoolEmailForm() {
  const { user, isVerified, verificationMethod, verificationExpiresAt, schoolEmail, school } = useAuth();
  const [email, setEmail] = useState("");
  const [cls, setCls] = useState<EmailClassification | null>(null);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [requests, setRequests] = useState<SchoolDomainRequest[]>([]);

  const loadRequests = async () => {
    if (!user) return;
    const { data } = await db.from("school_domain_requests")
      .select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5);
    setRequests((data ?? []) as SchoolDomainRequest[]);
  };
  useEffect(() => { loadRequests(); }, [user?.id]);

  // Indication pendant la saisie (le serveur refait le contrôle).
  useEffect(() => {
    const value = email.trim();
    if (!value.includes("@")) { setCls(null); return; }
    const id = setTimeout(async () => setCls(await classifyEmail(value)), 350);
    return () => clearTimeout(id);
  }, [email]);

  const verifiedByEmail = isVerified && verificationMethod === "school_email";

  async function submit() {
    const value = email.trim().toLowerCase();
    if (!value) return;
    setSending(true);
    const res = await requestSchoolEmailLink(value);
    setSending(false);
    if (res.error) { toast.error(res.error); return; }
    if (res.status === "sent") {
      setSentTo(value);
      toast.success(`Lien envoyé à ${value}.`);
    } else {
      toast.info("Demande envoyée aux admins.");
      setEmail("");
      loadRequests();
    }
  }

  if (verifiedByEmail) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold">Vérifié avec {schoolEmail}</p>
          <p>
            Tu fais partie de <strong>{school}</strong>
            {verificationExpiresAt && <> · valable jusqu'au {format(new Date(verificationExpiresAt), "d MMMM yyyy", { locale: fr })}</>}.
          </p>
        </div>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === "pending");
  const lastRejected = requests.find((r) => r.status === "rejected");

  return (
    <div className="space-y-4">
      {sentTo ? (
        <div className="space-y-3 rounded-xl border border-[#E3CC9C] bg-[#FBF5EA] p-4">
          <p className="flex items-center gap-2 font-semibold text-[#6B1A2F]"><Send className="h-4 w-4" />Regarde ta boîte mail d'école</p>
          <p className="text-sm text-muted-foreground">
            Un lien de confirmation a été envoyé à <strong>{sentTo}</strong>. Il est valable 24 h et ne marche qu'une fois.
            Pense à regarder dans les spams.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={submit} disabled={sending}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Renvoyer le lien
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setSentTo(null); setEmail(""); }}>Changer d'adresse</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="school-email">Ton adresse email d'école</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="school-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="prenom.nom@ecole.fr"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && cls && (cls.kind === "known" || cls.kind === "unknown")) submit(); }}
            />
            <Button
              onClick={submit}
              disabled={sending || !cls || (cls.kind !== "known" && cls.kind !== "unknown")}
              className="shrink-0 bg-gradient-primary shadow-glow"
            >
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {cls?.kind === "unknown" ? "Demander l'ajout de mon école" : "Recevoir le lien"}
            </Button>
          </div>
          {cls?.kind === "known" && (
            <p className="flex items-center gap-1.5 text-sm text-green-700">
              <GraduationCap className="h-4 w-4" />{cls.school} est reconnue.
            </p>
          )}
          {cls && KIND_HINT[cls.kind] && (
            <p className={`text-sm ${cls.kind === "public" ? "text-red-600" : "text-[#6B1A2F]"}`}>
              {KIND_HINT[cls.kind]}
              {cls.kind === "unknown" && " En attendant, tu peux utiliser le justificatif."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Ton adresse de connexion ({user?.email}) ne change pas.
          </p>
        </div>
      )}

      {pending.map((r) => (
        <div key={r.id} className="flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          <Clock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Demande d'ajout de <strong>{r.domain}</strong> en attente d'un admin. Tu recevras un lien sur {r.email} dès qu'elle est acceptée.
          </span>
        </div>
      ))}
      {pending.length === 0 && lastRejected && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{lastRejected.domain}</strong> n'a pas été ajouté{lastRejected.admin_note ? ` : ${lastRejected.admin_note}` : "."} Utilise le justificatif.
          </span>
        </div>
      )}
      {requests.some((r) => r.status === "approved") && !isVerified && (
        <p className="flex items-center gap-1.5 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />Ton école a été ajoutée : clique sur le lien reçu sur ton adresse d'école.
        </p>
      )}
    </div>
  );
}
