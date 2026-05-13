import { createFileRoute, useParams, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedLayout } from "@/components/ProtectedLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CalendarDays, MapPin, Users, Loader2, Ticket, Pencil,
  CheckCircle2, Lock, CreditCard, ShoppingCart, Timer, XCircle, Send,
  Search, MoreVertical, Mail, RefreshCw, UserCheck, UserX, GraduationCap, Building2,
  UserPlus, Trash2, Copy, Link as LinkIcon, Share2,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/events/$eventId")({
  component: () => <ProtectedLayout><EventDetail /></ProtectedLayout>,
  head: () => ({ meta: [{ title: "Événement — GuestEvent" }] }),
});

const TIMER_SECONDS = 15 * 60;

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function fmtCard(v: string) {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}
function fmtExpiry(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length >= 3 ? d.slice(0, 2) + "/" + d.slice(2) : d;
}

async function sendConfirmationEmail(params: {
  toEmail: string; fullName: string; eventTitle: string;
  eventDate: string; eventLocation: string; qrCode: string; replyTo?: string;
}) {
  const res = await fetch(
    "https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-confirmation-email",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params) }
  );
  if (!res.ok) { const b = await res.json().catch(() => ({})); return { error: b?.error ?? `HTTP ${res.status}` }; }
  return null;
}

function EventDetail() {
  const { eventId } = useParams({ from: "/events/$eventId" });
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [event, setEvent] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [myReg, setMyReg] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  // Message personnalisé (tous)
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);

  // Bénévoles
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [volName, setVolName] = useState("");
  const [volEmail, setVolEmail] = useState("");
  const [addingVol, setAddingVol] = useState(false);

  // Participants — recherche + actions individuelles
  const [participantSearch, setParticipantSearch] = useState("");
  const [targetParticipant, setTargetParticipant] = useState<any>(null);
  const [showParticipantEmail, setShowParticipantEmail] = useState(false);
  const [pMailSubject, setPMailSubject] = useState("");
  const [pMailBody, setPMailBody] = useState("");
  const [sendingPMail, setSendingPMail] = useState(false);
  const [actingParticipant, setActingParticipant] = useState<string | null>(null);

  // Ticket types
  const [ticketTypes, setTicketTypes] = useState<any[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Cart state
  const [showCart, setShowCart] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRegIdRef = useRef<string | null>(null);

  // User's actual school (for private event access check)
  const [userSchool, setUserSchool] = useState("");

  // Form fields
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [gender, setGender] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [regSchool, setRegSchool] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardName, setCardName] = useState("");

  const load = useCallback(async () => {
    const { data: ev } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
    setEvent(ev);
    const { data: regs } = await supabase
      .from("registrations")
      .select("id, event_id, user_id, status, qr_code, registered_at, attended_at, ticket_type_id")
      .eq("event_id", eventId)
      .order("registered_at", { ascending: true });
    const list = regs ?? [];
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    let profMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      profMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]));
    }

    const { data: types } = await (supabase as any)
      .from("ticket_types")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order");
    const typeList = types ?? [];
    setTicketTypes(typeList);
    const typeMap: Record<string, string> = Object.fromEntries(typeList.map((t: any) => [t.id, t.name]));

    const enriched = list.map((r) => ({ ...r, full_name: profMap[r.user_id], ticket_name: typeMap[r.ticket_type_id] ?? null }));
    setRegistrations(enriched);
    setMyReg(enriched.find((r) => r.user_id === user?.id) ?? null);

    const volResult = await (supabase as any).from("volunteers").select("*").eq("event_id", eventId).order("created_at");
    setVolunteers(volResult.data ?? []);

    setLoading(false);
  }, [eventId, user?.id]);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, birth_date, gender, school").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (data?.full_name) {
        const parts = data.full_name.trim().split(" ");
        setPrenom(parts[0] ?? "");
        setNom(parts.slice(1).join(" ") ?? "");
        setCardName(data.full_name);
      }
      if (data?.birth_date) setBirthDate(data.birth_date);
      if (data?.gender) setGender(data.gender);
      if (data?.school) { setRegSchool(data.school); setUserSchool(data.school); }
    });
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Timer
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!showCart) { setTimeLeft(TIMER_SECONDS); return; }
    setTimeLeft(TIMER_SECONDS);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setShowCart(false);
          if (pendingRegIdRef.current) {
            supabase.from("registrations").delete().eq("id", pendingRegIdRef.current);
            pendingRegIdRef.current = null;
          }
          toast.error("Réservation expirée. Veuillez réessayer.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [showCart]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!event) return <p className="text-muted-foreground">Événement introuvable.</p>;

  const active = registrations.filter((r) => r.status === "registered" || r.status === "attended" || r.status === "pending");
  const isOwner = user?.id === event.organizer_id || role === "admin";
  const timerPct = (timeLeft / TIMER_SECONDS) * 100;

  function getTicketRemaining(ticket: any): number {
    if (!ticket.capacity) return Infinity;
    const used = registrations.filter(
      (r) => r.ticket_type_id === ticket.id && ["registered", "attended", "pending"].includes(r.status)
    ).length;
    return Math.max(0, ticket.capacity - used);
  }

  const hasTicketTypes = ticketTypes.length > 0;
  const isFull = hasTicketTypes
    ? ticketTypes.every((t) => getTicketRemaining(t) <= 0)
    : event.capacity > 0 && active.length >= event.capacity;
  const totalCapacity = hasTicketTypes
    ? ticketTypes.reduce((sum: number, t: any) => sum + (t.capacity || 0), 0)
    : event.capacity;
  const remaining = totalCapacity > 0 ? totalCapacity - active.length : 0;

  const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId) ?? null;
  const cartPrice = selectedTicket ? selectedTicket.price : (event.price ?? 0);
  const eventPrice = event.price ?? 0;

  const isPrivateBlocked =
    event.status === "private" &&
    !isOwner &&
    userSchool.toLowerCase().trim() !== (event.school || "").toLowerCase().trim();

  async function openCart() {
    if (!user) return;
    if (hasTicketTypes && !selectedTicketId) { toast.error("Veuillez sélectionner un tarif."); return; }
    setActing(true);
    const { data, error } = await supabase
      .from("registrations")
      .insert({
        event_id: eventId,
        user_id: user.id,
        status: "pending",
        ...(selectedTicketId && { ticket_type_id: selectedTicketId }),
      })
      .select().single();
    setActing(false);
    if (error) {
      if (error.message.includes("event_full")) toast.error("Désolé, il n'y a plus de places disponibles.");
      else toast.error(error.message);
      load();
      return;
    }
    pendingRegIdRef.current = data.id;
    setShowCart(true);
  }

  async function closeCart() {
    setShowCart(false);
    if (pendingRegIdRef.current) {
      await supabase.from("registrations").delete().eq("id", pendingRegIdRef.current);
      pendingRegIdRef.current = null;
      load();
    }
  }

  async function confirmPayment() {
    if (!user || !pendingRegIdRef.current) return;
    if (!prenom.trim() || !nom.trim()) { toast.error("Veuillez renseigner votre prénom et nom."); return; }
    setActing(true);
    const fullName = `${prenom.trim()} ${nom.trim()}`;
    await supabase.from("profiles").update({
      full_name: fullName,
      ...(regSchool.trim() && { school: regSchool.trim() }),
    }).eq("id", user.id);
    const { data: regData, error } = await supabase
      .from("registrations")
      .update({ status: "registered" })
      .eq("id", pendingRegIdRef.current)
      .select().single();
    if (error) { setActing(false); toast.error(error.message); return; }
    pendingRegIdRef.current = null;
    try {
      const { data: orgEmail } = await (supabase as any).rpc("get_event_organizer_email", { p_event_id: eventId });
      const result = await sendConfirmationEmail({
        toEmail: user.email!,
        fullName,
        eventTitle: event.title,
        eventDate: format(new Date(event.starts_at), "PPP à p", { locale: fr }),
        eventLocation: event.location || "En ligne",
        qrCode: regData.qr_code,
        replyTo: orgEmail || undefined,
      });
      if (result?.error) toast.success("Inscription confirmée ! (Email : " + result.error + ")");
      else toast.success("🎉 Paiement confirmé ! Email envoyé avec votre billet.");
    } catch {
      toast.success("🎉 Inscription confirmée ! Votre QR code est disponible ci-dessous.");
    }
    setActing(false);
    setShowCart(false);
    load();
  }

  async function cancelRegistration() {
    if (!myReg) return;
    if (!confirm("Annuler votre inscription ?")) return;
    setActing(true);
    const { error } = await supabase.from("registrations").delete().eq("id", myReg.id);
    if (error) { setActing(false); toast.error(error.message); return; }
    setActing(false);
    toast.success("Inscription annulée.");
    load();
  }

  async function sendCustomMessage() {
    if (!msgBody.trim()) { toast.error("Le message ne peut pas être vide."); return; }
    if (!confirm(`Envoyer ce message à tous les inscrits de "${event.title}" ?`)) return;
    setSendingMsg(true);
    const res = await fetch(
      "https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-event-emails",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "custom", event_id: eventId, subject: msgSubject || undefined, message: msgBody, organizer_email: user?.email }),
      }
    );
    const data = await res.json().catch(() => ({}));
    setSendingMsg(false);
    if (data.error) { toast.error("Erreur : " + data.error); return; }
    toast.success(`Message envoyé à ${data.sent ?? 0} participant(s).`);
    setMsgSubject("");
    setMsgBody("");
  }

  async function cancelEvent() {
    if (!confirm("Supprimer cet événement ? Les inscrits recevront un email d'annulation. Cette action est irréversible.")) return;
    setActing(true);

    // Récupérer les emails des inscrits via RPC (accès auth.users côté serveur)
    const { data: participants } = await (supabase as any).rpc("get_participant_emails", { _event_id: eventId });
    const list = (participants ?? []) as { user_id: string; email: string; full_name: string }[];

    // Envoyer un email d'annulation à chaque inscrit (best-effort)
    if (list.length > 0) {
      const eventDate = event.starts_at ? format(new Date(event.starts_at), "PPP à p", { locale: fr }) : "";
      await Promise.allSettled(
        list.map((p) =>
          fetch("https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-cancellation-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toEmail: p.email,
              fullName: p.full_name || "Participant",
              eventTitle: event.title,
              eventDate,
              eventLocation: event.location || "En ligne",
              replyTo: user?.email,
            }),
          })
        )
      );
    }

    // Supprimer l'événement
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    setActing(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Événement supprimé${list.length > 0 ? ` — ${list.length} inscrit(s) notifié(s)` : ""}.`);
    navigate({ to: "/events" });
  }

  async function refundParticipant(reg: any) {
    if (!confirm(`Annuler l'inscription de ${reg.full_name || "ce participant"} ?`)) return;
    setActingParticipant(reg.id);
    const { error } = await supabase
      .from("registrations")
      .update({ status: "cancelled" })
      .eq("id", reg.id);
    if (error) { setActingParticipant(null); toast.error(error.message); return; }
    fetch("https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-event-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "cancel_participant", event_id: eventId, user_id: reg.user_id, organizer_email: user?.email }),
    });
    setActingParticipant(null);
    toast.success(`Inscription de ${reg.full_name || "ce participant"} annulée.`);
    load();
  }

  async function toggleAttendance(reg: any) {
    const newStatus = reg.status === "attended" ? "registered" : "attended";
    setActingParticipant(reg.id);
    const { error } = await supabase
      .from("registrations")
      .update({ status: newStatus, attended_at: newStatus === "attended" ? new Date().toISOString() : null })
      .eq("id", reg.id);
    setActingParticipant(null);
    if (error) { toast.error(error.message); return; }
    toast.success(newStatus === "attended" ? "Présence confirmée." : "Présence annulée.");
    load();
  }

  async function sendParticipantEmail() {
    if (!pMailBody.trim() || !targetParticipant) return;
    setSendingPMail(true);
    const res = await fetch(
      "https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-event-emails",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "custom",
          event_id: eventId,
          recipient_user_id: targetParticipant.user_id,
          subject: pMailSubject || undefined,
          message: pMailBody,
          organizer_email: user?.email,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    setSendingPMail(false);
    if (data.error) { toast.error("Erreur : " + data.error); return; }
    toast.success(`Email envoyé à ${targetParticipant.full_name || "ce participant"}.`);
    setShowParticipantEmail(false);
    setPMailSubject("");
    setPMailBody("");
  }

  async function addVolunteer() {
    if (!volName.trim()) { toast.error("Le nom est requis."); return; }
    if (!volEmail.trim()) { toast.error("L'email est requis."); return; }
    setAddingVol(true);
    const { data, error } = await (supabase as any).from("volunteers").insert({ event_id: eventId, name: volName.trim(), email: volEmail.trim() }).select().single();
    if (error) { setAddingVol(false); toast.error(error.message); return; }
    setVolunteers((v) => [...v, data]);
    const name = volName.trim();
    const email = volEmail.trim();
    setVolName("");
    setVolEmail("");
    fetch("https://ucufuoaspgmaittgvbrd.supabase.co/functions/v1/send-event-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "volunteer_invite",
        event_id: eventId,
        volunteer_name: name,
        volunteer_email: email,
        volunteer_url: volunteerUrl(data.token),
      }),
    });
    setAddingVol(false);
    toast.success("Bénévole ajouté — invitation envoyée par email.");
  }

  async function removeVolunteer(id: string) {
    if (!confirm("Supprimer ce bénévole ?")) return;
    await (supabase as any).from("volunteers").delete().eq("id", id);
    setVolunteers((v) => v.filter((x) => x.id !== id));
    toast.success("Bénévole supprimé.");
  }

  function volunteerUrl(token: string) {
    return `${window.location.origin}/volunteer/${token}`;
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(volunteerUrl(token));
    toast.success("Lien copié !");
  }

  async function shareEvent() {
    const url = window.location.href;
    const text = `${event.title} — ${format(new Date(event.starts_at), "PPP à p", { locale: fr })}${event.location ? ` · ${event.location}` : ""}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: event.title, text, url });
      } catch {}
    } else {
      navigator.clipboard.writeText(url);
      toast.success("Lien copié !");
    }
  }

  async function deleteEvent() {
    if (!confirm("Supprimer cet événement ? Cette action est irréversible.")) return;
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) { toast.error(error.message); return; }
    toast.success("Événement supprimé.");
    navigate({ to: "/events" });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">

      {/* ===== PANIER / CART DIALOG ===== */}
      <Dialog open={showCart} onOpenChange={(open) => { if (!open) closeCart(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Votre panier
            </DialogTitle>
          </DialogHeader>

          {/* Timer */}
          <div className={`rounded-xl p-3 ${timeLeft < 120 ? "bg-red-50 border border-red-200" : "bg-orange-50 border border-orange-200"}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-700">
                <Timer className="h-4 w-4" />
                Place réservée temporairement
              </div>
              <span className={`font-mono text-lg font-bold ${timeLeft < 120 ? "text-red-600" : "text-orange-600"}`}>
                {fmt(timeLeft)}
              </span>
            </div>
            <Progress value={timerPct} className="h-2" />
            <p className="mt-1.5 text-xs text-orange-600">
              Confirmez avant expiration — votre place sera libérée automatiquement.
            </p>
          </div>

          {/* Récapitulatif */}
          <div className="rounded-xl border bg-muted/30 p-4 space-y-1">
            <p className="font-semibold text-[#72243E]">{event.title}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {format(new Date(event.starts_at), "PPP à p", { locale: fr })}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />{event.location || "En ligne"}
            </p>
            <Separator className="my-2" />
            {selectedTicket && (
              <div className="text-xs text-muted-foreground mb-1">Tarif : <span className="font-medium text-foreground">{selectedTicket.name}</span></div>
            )}
            <div className="flex justify-between text-sm">
              <span>1 place</span>
              <span>{cartPrice > 0 ? `${cartPrice} €` : "Gratuit"}</span>
            </div>
            {cartPrice > 0 && (
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{cartPrice} €</span>
              </div>
            )}
          </div>

          {/* Informations personnelles */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Vos informations</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cp">Prénom *</Label>
                <Input id="cp" value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Marie" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cn">Nom *</Label>
                <Input id="cn" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Dupont" />
              </div>
            </div>
          </div>

          {/* École */}
          <div className="space-y-1.5">
            <Label>École / Université <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
            <Input value={regSchool} onChange={(e) => setRegSchool(e.target.value)} placeholder="Ex : ESME, Paris Saclay…" />
          </div>

          {/* Paiement fictif */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Paiement</p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />Sécurisé par Stripe
              </div>
            </div>
            <div className="rounded-xl border p-4 space-y-3 bg-white">
              <div className="space-y-1.5">
                <Label htmlFor="cname">Titulaire de la carte</Label>
                <Input id="cname" value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Marie Dupont" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cnum">Numéro de carte</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="cnum"
                    className="pl-9"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(fmtCard(e.target.value))}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cexp">Date d'expiration</Label>
                  <Input
                    id="cexp"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(fmtExpiry(e.target.value))}
                    placeholder="MM/AA"
                    maxLength={5}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ccvv">CVV</Label>
                  <Input
                    id="ccvv"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="123"
                    maxLength={3}
                    type="password"
                  />
                </div>
              </div>
              {/* Faux logos CB */}
              <div className="flex gap-2 pt-1">
                {["VISA", "MC", "AMEX"].map((b) => (
                  <span key={b} className="rounded border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{b}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Bouton payer */}
          <Button onClick={confirmPayment} disabled={acting} className="w-full bg-gradient-primary shadow-glow h-11 text-base">
            {acting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
            {cartPrice > 0 ? `Payer ${cartPrice} €` : "Confirmer l'inscription"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Paiement fictif — aucun prélèvement réel ne sera effectué.
          </p>
        </DialogContent>
      </Dialog>

      {/* Cover image */}
      {event.cover_image_url && (
        <div className="relative h-56 w-full overflow-hidden rounded-2xl shadow-elegant sm:h-72">
          <img src={event.cover_image_url} alt={event.title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        </div>
      )}

      {/* Event card */}
      <Card className="overflow-hidden border-2 shadow-elegant">
        {!event.cover_image_url && <div className="h-3 bg-gradient-vibrant" />}
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight not-italic">{event.title}</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={shareEvent}>
                <Share2 className="mr-2 h-4 w-4" />Partager
              </Button>
              {isOwner && (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/events/$eventId/edit" params={{ eventId }}>
                      <Pencil className="mr-2 h-4 w-4" />Modifier
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={cancelEvent} disabled={acting} className="text-orange-600 hover:text-orange-600">
                    <XCircle className="mr-2 h-4 w-4" />Annuler
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {event.status === "private" && (
              <Badge className="bg-[#72243E] text-white hover:bg-[#72243E]">
                <Lock className="mr-1 h-3 w-3" />Privé · {event.school || "École"}
              </Badge>
            )}
            {event.school && event.status !== "private" && (
              <Badge variant="secondary" className="bg-[#D5E8A0] text-[#204839]">
                <GraduationCap className="mr-1 h-3.5 w-3.5" />{event.school}
              </Badge>
            )}
            {event.association && (
              <Badge variant="secondary">
                <Building2 className="mr-1 h-3.5 w-3.5" />{event.association}
              </Badge>
            )}
          </div>

          <p className="mt-3 text-muted-foreground">{event.description || "Aucune description."}</p>

          <div className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{format(new Date(event.starts_at), "PPP p", { locale: fr })}</div>
            <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{event.location || "En ligne"}</div>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />{active.length} / {totalCapacity > 0 ? totalCapacity : "∞"}
              {isFull ? <Badge variant="destructive" className="ml-1">Complet</Badge>
                : remaining < 10 && totalCapacity > 0 ? <Badge className="ml-1 bg-orange-500 hover:bg-orange-500">{remaining} place{remaining > 1 ? "s" : ""}</Badge>
                : null}
            </div>
          </div>

          {totalCapacity > 0 && (
            <div className="mt-4"><Progress value={Math.min(100, (active.length / totalCapacity) * 100)} className="h-2" /></div>
          )}

          {/* Tarifs */}
          {hasTicketTypes ? (
            <div className="mt-5 space-y-2">
              <p className="text-sm font-semibold">Tarifs</p>
              <div className="grid gap-2">
                {ticketTypes.map((ticket) => {
                  const ticketRemaining = getTicketRemaining(ticket);
                  const isTicketFull = ticketRemaining <= 0;
                  const isSelected = selectedTicketId === ticket.id;
                  return (
                    <button
                      key={ticket.id}
                      type="button"
                      disabled={isTicketFull || !!myReg || isOwner}
                      onClick={() => setSelectedTicketId(isSelected ? null : ticket.id)}
                      className={`flex items-center justify-between rounded-lg border-2 p-3 text-left transition-all w-full ${
                        isSelected
                          ? "border-[#72243E] bg-[#EED4D8]"
                          : isTicketFull
                          ? "border-border bg-muted/30 opacity-60 cursor-not-allowed"
                          : "border-border hover:border-[#C87488] cursor-pointer"
                      }`}
                    >
                      <div>
                        <p className="font-medium text-sm">{ticket.name}</p>
                        {ticket.description && <p className="text-xs text-muted-foreground">{ticket.description}</p>}
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="font-semibold text-[#72243E]">
                          {ticket.price > 0 ? `${ticket.price} €` : "Gratuit"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {!ticket.capacity
                            ? "Illimité"
                            : isTicketFull
                            ? "Complet"
                            : `${ticketRemaining} place${ticketRemaining > 1 ? "s" : ""}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            eventPrice > 0 && <p className="mt-3 text-lg font-semibold text-[#72243E]">{eventPrice} €</p>
          )}

          {/* Actions */}
          <div className="mt-6">
            {isPrivateBlocked ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#D5A0A8] bg-[#EED4D8]/50 px-4 py-3 text-sm text-[#72243E]">
                <Lock className="h-4 w-4 shrink-0" />
                Cet événement est réservé aux membres de <strong className="ml-1">{event.school}</strong>.
              </div>
            ) : (
              <>
                {!isOwner && !myReg && !isFull && (
                  <Button
                    onClick={openCart}
                    disabled={acting || (hasTicketTypes && !selectedTicketId)}
                    className="bg-gradient-primary shadow-glow"
                  >
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    {hasTicketTypes && !selectedTicketId ? "Sélectionnez un tarif" : "Réserver ma place"}
                  </Button>
                )}
                {!myReg && isFull && (
                  <p className="text-sm text-muted-foreground">Cet événement est complet.</p>
                )}
                {myReg?.status === "registered" && (
                  <Button variant="outline" onClick={cancelRegistration} disabled={acting}>Annuler mon inscription</Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* QR Code */}
      {myReg?.status === "registered" && (
        <Card className="border-2 shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />Mon billet · QR Code
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <div className="rounded-xl bg-white p-4 shadow-elegant">
              <QRCodeCanvas value={myReg.qr_code} size={180} />
            </div>
            <Badge className="capitalize"><CheckCircle2 className="mr-1 h-3 w-3" />Inscription confirmée</Badge>
            <p className="text-xs text-muted-foreground">Présentez ce code à l'entrée · également envoyé par email.</p>
            <code className="rounded bg-muted px-2 py-1 text-xs">{myReg.qr_code}</code>
          </CardContent>
        </Card>
      )}

      {/* Présence */}
      {myReg?.status === "attended" && (
        <Card className="border-2 border-emerald-400 shadow-elegant">
          <CardContent className="flex items-center gap-3 p-5">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div>
              <p className="font-semibold">Présence confirmée</p>
              <p className="text-sm text-muted-foreground">
                {myReg.attended_at ? `Scanné le ${format(new Date(myReg.attended_at), "PPP à p", { locale: fr })}` : ""}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bénévoles (organisateur) */}
      {isOwner && (
        <Card className="border-2 shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Bénévoles ({volunteers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Ajouter un bénévole */}
            <div className="flex flex-wrap gap-2">
              <Input className="flex-1 min-w-40" placeholder="Nom *" value={volName} onChange={(e) => setVolName(e.target.value)} />
              <Input className="flex-1 min-w-40" placeholder="Email *" type="email" value={volEmail} onChange={(e) => setVolEmail(e.target.value)} />
              <Button onClick={addVolunteer} disabled={addingVol} className="bg-gradient-primary shadow-glow">
                {addingVol ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </div>

            {volunteers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun bénévole pour l'instant.</p>
            ) : (
              <ul className="divide-y">
                {volunteers.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{v.name}</p>
                      {v.email && <p className="text-xs text-muted-foreground">{v.email}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => copyLink(v.token)} className="gap-1.5 text-xs">
                        <Copy className="h-3.5 w-3.5" />Lien
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeVolunteer(v.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {volunteers.length > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <LinkIcon className="h-3 w-3" />
                Le lien permet au bénévole de scanner les QR codes sans créer de compte.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Message personnalisé (organisateur) */}
      {isOwner && (
        <Card className="border-2 shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Envoyer un message aux participants
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="msg-subject">Objet (optionnel)</Label>
              <Input
                id="msg-subject"
                value={msgSubject}
                onChange={(e) => setMsgSubject(e.target.value)}
                placeholder={`Message de l'organisateur — ${event.title}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="msg-body">Message *</Label>
              <Textarea
                id="msg-body"
                rows={5}
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                placeholder="Écrivez votre message ici…"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Envoyé à tous les inscrits confirmés ({active.length} participant{active.length > 1 ? "s" : ""}).
              </p>
              <Button onClick={sendCustomMessage} disabled={sendingMsg || !msgBody.trim()} className="bg-gradient-primary shadow-glow">
                {sendingMsg ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Envoyer
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog email individuel */}
      <Dialog open={showParticipantEmail} onOpenChange={(o) => { if (!o) { setShowParticipantEmail(false); setPMailSubject(""); setPMailBody(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Email à {targetParticipant?.full_name || "ce participant"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="pm-subject">Objet (optionnel)</Label>
              <Input id="pm-subject" value={pMailSubject} onChange={(e) => setPMailSubject(e.target.value)} placeholder={`Message — ${event?.title ?? ""}`} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-body">Message *</Label>
              <Textarea id="pm-body" rows={5} value={pMailBody} onChange={(e) => setPMailBody(e.target.value)} placeholder="Écrivez votre message ici…" />
            </div>
            <Button onClick={sendParticipantEmail} disabled={sendingPMail || !pMailBody.trim()} className="w-full bg-gradient-primary shadow-glow">
              {sendingPMail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Envoyer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Liste participants (organisateur) */}
      {isOwner && (
        <Card className="border-2 shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Participants ({active.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Barre de recherche */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher un participant…"
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
              />
            </div>

            {registrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune inscription pour l'instant.</p>
            ) : (() => {
              const filtered = registrations.filter((r) =>
                r.status !== "cancelled" &&
                (r.full_name || "").toLowerCase().includes(participantSearch.toLowerCase())
              );
              if (filtered.length === 0) return (
                <p className="py-4 text-center text-sm text-muted-foreground">Aucun résultat pour « {participantSearch} ».</p>
              );
              return (
                <ul className="divide-y">
                  {filtered.map((r) => (
                    <li key={r.id} className="flex items-center justify-between py-3 gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{r.full_name || "Participant"}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.ticket_name ? `${r.ticket_name} · ` : ""}
                          {r.registered_at ? `Inscrit le ${new Date(r.registered_at).toLocaleDateString("fr-FR")}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className={r.status === "attended" ? "bg-emerald-100 text-emerald-700" : r.status === "registered" ? "bg-blue-100 text-blue-700" : ""}
                        >
                          {r.status === "registered" ? "Confirmé" : r.status === "attended" ? "Présent" : r.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" disabled={actingParticipant === r.id}>
                              {actingParticipant === r.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <MoreVertical className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setTargetParticipant(r); setShowParticipantEmail(true); }}>
                              <Mail className="mr-2 h-4 w-4" />Envoyer un email
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleAttendance(r)}>
                              {r.status === "attended"
                                ? <><UserX className="mr-2 h-4 w-4" />Annuler la présence</>
                                : <><UserCheck className="mr-2 h-4 w-4" />Marquer présent</>}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => refundParticipant(r)} className="text-destructive focus:text-destructive">
                              <RefreshCw className="mr-2 h-4 w-4" />Rembourser / Annuler
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
