import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// Tables lues avec les droits de l'utilisateur (RLS) : il ne récupère que ses propres données.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function readOwn(table: string, column: string, id: string, select = "*") {
  const { data, error } = await db.from(table).select(select).eq(column, id);
  return error ? { erreur: error.message } : data;
}

/**
 * « Mes données » : droit d'accès et de portabilité (export JSON) et droit à l'effacement
 * (suppression du compte en libre-service). Dossier de conformité RGPD, section Droits.
 */
export function MyDataCard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function exportData() {
    if (!user) return;
    setExporting(true);
    try {
      const [profil, roles, inscriptions, listesAttente, likes, abonnements] = await Promise.all([
        readOwn("profiles", "id", user.id),
        readOwn("user_roles", "user_id", user.id, "role, created_at"),
        readOwn("registrations", "user_id", user.id, "*, events(title, starts_at, location, city)"),
        readOwn("waitlist", "user_id", user.id),
        readOwn("event_likes", "user_id", user.id),
        readOwn("association_follows", "user_id", user.id),
      ]);
      const contenu = {
        export: { date: new Date().toISOString(), service: "Plav'", format: "JSON" },
        compte: {
          id: user.id,
          email: user.email,
          cree_le: user.created_at,
          derniere_connexion: user.last_sign_in_at,
          fournisseur: user.app_metadata?.provider,
        },
        profil, roles, inscriptions, listes_d_attente: listesAttente, likes, abonnements,
      };
      const blob = new Blob([JSON.stringify(contenu, null, 2)], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `plav-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      toast.success("Tes données ont été téléchargées.");
    } catch {
      toast.error("Le téléchargement a échoué. Réessaie dans un instant.");
    } finally {
      setExporting(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("delete-account", { body: { confirm: confirmText.trim() } });
    if (error || !data?.ok) {
      // Le message du serveur explique pourquoi (événements en cours, rôle admin…).
      let message = "La suppression a échoué. Réessaie, ou écris-nous.";
      try { message = (await error?.context?.json())?.error ?? data?.error ?? message; } catch { /* message par défaut */ }
      setDeleting(false);
      toast.error(message);
      return;
    }
    await signOut().catch(() => {});
    toast.success("Ton compte a été supprimé. À bientôt peut-être !");
    navigate({ to: "/" });
  }

  return (
    <Card className="border-2 shadow-elegant">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Mes données</CardTitle>
        <CardDescription>
          Récupère une copie de tes données ou supprime ton compte. Détails dans la{" "}
          <Link to="/confidentialite" className="underline">politique de confidentialité</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={exportData} disabled={exporting}>
          {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Télécharger mes données
        </Button>
        <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setConfirmText(""); setOpen(true); }}>
          <Trash2 className="mr-2 h-4 w-4" />Supprimer mon compte
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={(v) => { if (!deleting) setOpen(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ton compte ?</DialogTitle>
            <DialogDescription>
              C'est définitif : ton profil, tes billets (y compris à venir), tes listes d'attente, tes likes et tes
              abonnements seront effacés. Tes places à venir seront proposées à la liste d'attente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirmDelete">Tape <strong>SUPPRIMER</strong> pour confirmer</Label>
            <Input id="confirmDelete" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>Annuler</Button>
            <Button variant="destructive" onClick={deleteAccount} disabled={deleting || confirmText.trim() !== "SUPPRIMER"}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
