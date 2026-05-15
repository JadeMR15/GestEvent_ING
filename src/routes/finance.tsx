import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Euro, ArrowDownToLine, Clock, TrendingUp, Ticket, Loader2, CheckCircle2, AlertCircle, RefreshCcw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/finance")({
  component: () => (
    <ProtectedLayout allow={["organizer", "admin"]}>
      <FinancePage />
    </ProtectedLayout>
  ),
  head: () => ({ meta: [{ title: "Finances — Plav'" }] }),
});

const STATUS_PAYOUT: Record<string, { label: string; color: string }> = {
  pending:    { label: "En attente",   color: "bg-yellow-100 text-yellow-800" },
  processing: { label: "En cours",     color: "bg-blue-100 text-blue-800" },
  completed:  { label: "Effectué",     color: "bg-emerald-100 text-emerald-800" },
  failed:     { label: "Échoué",       color: "bg-red-100 text-red-800" },
};

function fmt(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function StatCard({ icon: Icon, label, value, sub, accent = false }: {
  icon: any; label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <Card className="border-2 shadow-elegant">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${accent ? "text-[#6B0F2C]" : ""}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`h-12 w-12 rounded-full flex items-center justify-center ${accent ? "bg-[#EED4D8]" : "bg-muted"}`}>
            <Icon className={`h-6 w-6 ${accent ? "text-[#6B0F2C]" : "text-muted-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FinancePage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [iban, setIban] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    if (!user) return;

    // Transactions : registrations payantes liées aux événements de l'organisateur
    const { data: txs } = await (supabase as any)
      .from("registrations")
      .select(`
        id, status, registered_at, guest_name, guest_email,
        ticket_types ( name, price ),
        events!inner ( id, title, organizer_id, price )
      `)
      .eq("events.organizer_id", user.id)
      .in("status", ["registered", "attended"])
      .order("registered_at", { ascending: false });

    // Prix effectif = events.price (cohérent avec le Dashboard), fallback ticket_types.price
    const withPrice = (txs ?? []).map((r: any) => ({
      ...r,
      _price: r.events?.price ?? r.ticket_types?.price ?? 0,
    }));
    const paid = withPrice.filter((r: any) => r._price > 0);
    setTransactions(paid);

    // Historique des virements
    const { data: po } = await (supabase as any)
      .from("payouts")
      .select("*")
      .eq("organizer_id", user.id)
      .order("created_at", { ascending: false });
    setPayouts(po ?? []);

    setLoading(false);
  }

  useEffect(() => { load(); }, [user]);

  const totalEarned = useMemo(
    () => transactions.reduce((s, r) => s + (r._price ?? 0), 0),
    [transactions]
  );

  const totalPaidOut = useMemo(
    () => payouts.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0),
    [payouts]
  );

  const totalPending = useMemo(
    () => payouts.filter((p) => ["pending", "processing"].includes(p.status)).reduce((s, p) => s + p.amount, 0),
    [payouts]
  );

  const available = Math.max(0, totalEarned - totalPaidOut - totalPending);

  async function requestPayout() {
    const amt = parseFloat(amount.replace(",", "."));
    if (isNaN(amt) || amt <= 0) { toast.error("Montant invalide."); return; }
    if (amt > available) { toast.error(`Montant supérieur au solde disponible (${fmt(available)}).`); return; }
    const cleanIban = iban.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleanIban)) { toast.error("IBAN invalide."); return; }

    setSubmitting(true);
    const { error } = await (supabase as any).from("payouts").insert({
      organizer_id: user!.id,
      amount: amt,
      iban: cleanIban,
      note: note.trim(),
      status: "pending",
    });
    setSubmitting(false);

    if (error) { toast.error("Erreur : " + error.message); return; }

    toast.success("Demande de virement envoyée !");
    setDialogOpen(false);
    setAmount("");
    setIban("");
    setNote("");
    load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Finances</h1>
          <p className="text-muted-foreground">Suivez vos revenus et demandez des virements.</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={available <= 0}
          className="bg-gradient-primary shadow-glow"
        >
          <ArrowDownToLine className="mr-2 h-4 w-4" />
          Demander un virement
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={TrendingUp} label="Solde disponible" value={fmt(available)} accent sub="Prêt à être viré" />
        <StatCard icon={Euro}        label="Total encaissé"   value={fmt(totalEarned)} sub={`${transactions.length} transaction(s)`} />
        <StatCard icon={CheckCircle2} label="Déjà viré"       value={fmt(totalPaidOut)} />
        <StatCard icon={Clock}       label="En attente"       value={fmt(totalPending)} sub={`${payouts.filter((p) => ["pending","processing"].includes(p.status)).length} demande(s)`} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="transactions">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="transactions"><Ticket className="mr-1.5 h-4 w-4" />Transactions</TabsTrigger>
          <TabsTrigger value="payouts"><ArrowDownToLine className="mr-1.5 h-4 w-4" />Virements</TabsTrigger>
        </TabsList>

        {/* ── Transactions ── */}
        <TabsContent value="transactions" className="mt-4">
          <Card className="border-2 shadow-elegant">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Historique des paiements</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Aucune transaction payante pour le moment.
                </div>
              ) : (
                <div className="divide-y">
                  {transactions.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{r.events?.title ?? "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {r.ticket_types?.name ?? "Billet"}
                          {r.guest_name ? ` · ${r.guest_name}` : ""}
                          {" · "}
                          {r.registered_at ? format(new Date(r.registered_at), "d MMM yyyy à HH:mm", { locale: fr }) : "—"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-[#6B0F2C]">+{fmt(r._price ?? 0)}</p>
                        <Badge variant="secondary" className={`text-[10px] mt-0.5 ${r.status === "attended" ? "bg-emerald-100 text-emerald-800" : ""}`}>
                          {r.status === "attended" ? "Présent" : "Inscrit"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Virements ── */}
        <TabsContent value="payouts" className="mt-4">
          <Card className="border-2 shadow-elegant">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Historique des virements</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {payouts.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Aucun virement demandé pour le moment.
                </div>
              ) : (
                <div className="divide-y">
                  {payouts.map((p) => {
                    const s = STATUS_PAYOUT[p.status] ?? STATUS_PAYOUT.pending;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{fmt(p.amount)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            IBAN : {p.iban.slice(0, 4)} •••• {p.iban.slice(-4)}
                            {p.note ? ` · ${p.note}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Demandé le {format(new Date(p.created_at), "d MMM yyyy", { locale: fr })}
                            {p.processed_at ? ` · Traité le ${format(new Date(p.processed_at), "d MMM yyyy", { locale: fr })}` : ""}
                          </p>
                        </div>
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${s.color}`}>
                          {s.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog virement */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Demander un virement</DialogTitle>
          </DialogHeader>

          <div className="rounded-lg bg-[#EED4D8]/40 border border-[#D5A0A8] px-4 py-3 text-sm">
            <p className="text-muted-foreground">Solde disponible</p>
            <p className="text-2xl font-bold text-[#6B0F2C]">{fmt(available)}</p>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Montant (€) *</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder={`Max ${fmt(available)}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iban">IBAN *</Label>
              <Input
                id="iban"
                placeholder="FR76 3000 6000 0112 3456 7890 189"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note">Note <span className="text-muted-foreground font-normal text-xs">(optionnel)</span></Label>
              <Input
                id="note"
                placeholder="ex : Soirée BDE Mars"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={requestPayout} disabled={submitting} className="bg-gradient-primary shadow-glow">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Confirmer le virement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
