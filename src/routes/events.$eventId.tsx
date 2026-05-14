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
  UserPlus, Trash2, Copy, Link as LinkIcon, Share2, Minus, Plus, Check,
  ChevronLeft, ChevronRight, PlayCircle, Upload, FileText, X,
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
  const [cartItems, setCartItems] = useState<Record<string, number>>({});

  // Achat multi-places
  const [myGuestRegs, setMyGuestRegs] = useState<any[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [friends, setFriends] = useState<{ prenom: string; nom: string; email: string }[]>([]);

  // Partage
  const [copied, setCopied] = useState(false);

  // Media gallery carousel
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);

  // Cart state
  const [showCart, setShowCart] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const pendingRegIdsRef = useRef<string[]>([]);
  const ticketAllocationRef = useRef<string[]>([]); // ticket_type_id par slot (index 0 = perso, 1+ = amis)

  // User's actual school (for private event access check)
  const [userSchool, setUserSchool] = useState("");

  // Document requis
  const [docFile, setDocFile] = useState<File | null>(null);

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
      .select("id, event_id, user_id, status, qr_code, registered_at, attended_at, ticket_type_id, guest_name, guest_email, document_url")
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

    const enriched = list.map((r) => ({ ...r, full_name: r.guest_name || profMap[r.user_id], ticket_name: typeMap[r.ticket_type_id] ?? null }));
    setRegistrations(enriched);
    const myRegs = enriched.filter((r) => r.user_id === user?.id);
    setMyReg(myRegs.find((r) => !r.guest_email) ?? null);
    setMyGuestRegs(myRegs.filter((r) => !!r.guest_email));

    const volResult = await (supabase as any).from("volunteers").select("*").eq("event_id", eventId).order("created_at");
    setVolunteers(volResult.data ?? []);
    const { data: media } = await (supabase as any).from("event_media").select("*").eq("event_id", eventId).order("sort_order");
    setMediaItems(media ?? []);
    setActiveMediaIdx(0);
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

  // Realtime : recharger dès qu'une inscription change sur cet événement
  useEffect(() => {
    const channel = supabase
      .channel(`registrations:${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "registrations", filter: `event_id=eq.${eventId}` },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId, load]);

  // Timer — effet 1 : démarrer/arrêter le compte à rebours
  useEffect(() => {
    if (!showCart) { setTimeLeft(TIMER_SECONDS); return; }
    setTimeLeft(TIMER_SECONDS);
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [showCart]);

  // Timer — effet 2 : gérer l'expiration quand timeLeft atteint 0
  useEffect(() => {
    if (!showCart || timeLeft > 0) return;
    setShowCart(false);
    if (pendingRegIdsRef.current.length > 0) {
      supabase.from("registrations").delete().in("id", pendingRegIdsRef.current);
      pendingRegIdsRef.current = [];
    }
    toast.error("Réservation expirée. Veuillez réessayer.");
  }, [timeLeft, showCart]);


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
  const eventPrice = event.price ?? 0;
  const maxPerPerson = event.max_per_person ?? 0;
  const alreadyBooked = (myReg ? 1 : 0) + myGuestRegs.length;
  const maxQty = (() => {
    let m = event.capacity > 0 ? Math.min(remaining, 10) : 10;
    if (maxPerPerson > 0) m = Math.min(m, maxPerPerson - alreadyBooked);
    return Math.max(0, m);
  })();

  // Multi-ticket cart totals
  const totalCartQty = hasTicketTypes
    ? Object.values(cartItems).reduce((s, q) => s + q, 0)
    : quantity;
  const totalCartPrice = hasTicketTypes
    ? Object.entries(cartItems).reduce((s, [tid, qty]) => {
        const t = ticketTypes.find((t) => t.id === tid);
        return s + (t?.price ?? 0) * qty;
      }, 0)
    : eventPrice * quantity;

  function updateCartItem(ticketId: string, qty: number) {
    setCartItems((prev) => {
      if (qty <= 0) { const n = { ...prev }; delete n[ticketId]; return n; }
      return { ...prev, [ticketId]: qty };
    });
  }

  function handleQuantityChange(newQty: number) {
    setQuantity(newQty);
    setFriends(Array.from({ length: newQty - 1 }, (_, i) => friends[i] ?? { prenom: "", nom: "", email: "" }));
  }

  const isPrivateBlocked =
    event.status === "private" &&
    !isOwner &&
    userSchool.toLowerCase().trim() !== (event.school || "").toLowerCase().trim();

  async function openCart() {
    if (!user) return;
    if (hasTicketTypes && totalCartQty === 0) { toast.error("Sélectionnez au moins une place."); return; }
    if (maxPerPerson > 0 && alreadyBooked + totalCartQty > maxPerPerson) {
      toast.error(`Maximum ${maxPerPerson} place${maxPerPerson > 1 ? "s" : ""} par personne pour cet événement.`);
      return;
    }
    setActing(true);

    if (hasTicketTypes) {
      // Aplatir les sélections : [tid_slot1, tid_slot2, ...] — slot 0 = perso, reste = amis
      const allocation = Object.entries(cartItems)
        .filter(([, q]) => q > 0)
        .flatMap(([tid, qty]) => Array(qty).fill(tid));
      ticketAllocationRef.current = allocation;

      // Créer UNE SEULE pending registration personnelle
      const { data, error } = await supabase
        .from("registrations")
        .insert({ event_id: eventId, user_id: user.id, status: "pending", ticket_type_id: allocation[0] })
        .select().single();
      setActing(false);
      if (error) {
        if (error.message.includes("event_full")) toast.error("Désolé, il n'y a plus de places disponibles.");
        else toast.error(error.message);
        load(); return;
      }
      pendingRegIdsRef.current = [data.id];
    } else {
      const { data, error } = await supabase
        .from("registrations")
        .insert({ event_id: eventId, user_id: user.id, status: "pending" })
        .select().single();
      setActing(false);
      if (error) {
        if (error.message.includes("event_full")) toast.error("Désolé, il n'y a plus de places disponibles.");
        else toast.error(error.message);
        load(); return;
      }
      pendingRegIdsRef.current = [data.id];
    }

    if (totalCartQty > 1) {
      setFriends(Array.from({ length: totalCartQty - 1 }, (_, i) => friends[i] ?? { prenom: "", nom: "", email: "" }));
    }
    setShowCart(true);
  }

  async function closeCart() {
    setShowCart(false);
    if (pendingRegIdsRef.current.length > 0) {
      await supabase.from("registrations").delete().in("id", pendingRegIdsRef.current);
      pendingRegIdsRef.current = [];
      load();
    }
  }

  async function confirmPayment() {
    if (!user || pendingRegIdsRef.current.length === 0) return;
    if (!prenom.trim() || !nom.trim()) { toast.error("Veuillez renseigner votre prénom et nom."); return; }
    if (event.required_document && !docFile) {
      toast.error(`Veuillez uploader votre ${event.required_document}.`);
      return;
    }
    const friendsNeeded = hasTicketTypes ? ticketAllocationRef.current.length - 1 : quantity - 1;
    for (let i = 0; i < friendsNeeded; i++) {
      const f = friends[i];
      if (!f.prenom.trim() || !f.nom.trim()) { toast.error(`Prénom et nom requis pour l'ami ${i + 1}.`); return; }
      if (!f.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) { toast.error(`Email invalide pour l'ami ${i + 1}.`); return; }
    }
    setActing(true);

    let documentUrl: string | null = null;
    if (docFile) {
      const ext = docFile.name.split(".").pop() ?? "pdf";
      const path = `documents/${eventId}/${user.id}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("event-covers").upload(path, docFile, { upsert: true });
      if (uploadErr) { setActing(false); toast.error("Erreur upload document : " + uploadErr.message); return; }
      const { data: urlData } = supabase.storage.from("event-covers").getPublicUrl(path);
      documentUrl = urlData.publicUrl;
    }

    const fullName = `${prenom.trim()} ${nom.trim()}`;
    await supabase.from("profiles").update({
      full_name: fullName,
      ...(regSchool.trim() && { school: regSchool.trim() }),
    }).eq("id", user.id);

    // Confirmer la première place (personnelle)
    const { data: regData, error } = await supabase
      .from("registrations")
      .update({ status: "registered", ...(documentUrl && { document_url: documentUrl }) })
      .eq("id", pendingRegIdsRef.current[0])
      .select().single();
    if (error) { setActing(false); toast.error(error.message); return; }

    let guestRegs: any[] = [];
    const extraSlots = hasTicketTypes ? ticketAllocationRef.current.length - 1 : quantity - 1;

    if (extraSlots > 0) {
      const { data: gd, error: ge } = await supabase
        .from("registrations")
        .insert(friends.slice(0, extraSlots).map((f, i) => ({
          event_id: eventId,
          user_id: user.id,
          status: "registered" as const,
          guest_name: `${f.prenom.trim()} ${f.nom.trim()}`,
          guest_email: f.email.trim().toLowerCase(),
          ...(hasTicketTypes && ticketAllocationRef.current[i + 1]
            ? { ticket_type_id: ticketAllocationRef.current[i + 1] }
            : {}),
        })))
        .select();
      if (ge) toast.error("Erreur inscriptions amis : " + ge.message);
      else guestRegs = gd ?? [];
    }

    const emailDate = format(new Date(event.starts_at), "PPP à p", { locale: fr });
    const emailLoc = event.location || "En ligne";
    try {
      await sendConfirmationEmail({ toEmail: user.email!, fullName, eventTitle: event.title, eventDate: emailDate, eventLocation: emailLoc, qrCode: regData.qr_code });
    } catch {}
    for (const gr of guestRegs) {
      try {
        await sendConfirmationEmail({ toEmail: gr.guest_email, fullName: gr.guest_name, eventTitle: event.title, eventDate: emailDate, eventLocation: emailLoc, qrCode: gr.qr_code });
      } catch {}
    }

    const total = 1 + guestRegs.length;
    toast.success(`🎉 ${total} place${total > 1 ? "s confirmées" : " confirmée"} ! Emails envoyés.`);
    setActing(false);
    setShowCart(false);
    setQuantity(1);
    setFriends([]);
    setDocFile(null);
    setCartItems({});
    pendingRegIdsRef.current = [];
    ticketAllocationRef.current = [];
    load();
  }

  async function cancelRegistration(regId: string, label: string) {
    if (!confirm(`Annuler la place de ${label} ?`)) return;
    setActing(true);
    const { error } = await supabase.from("registrations").delete().eq("id", regId);
    if (error) { setActing(false); toast.error(error.message); return; }
    setActing(false);
    toast.success(`Place de ${label} annulée.`);
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
      try { await navigator.share({ title: event.title, text, url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getEmbedUrl(url: string): { kind: "youtube" | "vimeo" | "direct" | null; src: string } {
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (yt) return { kind: "youtube", src: `https://www.youtube.com/embed/${yt[1]}` };
    const vimeo = url.match(/(?:vimeo\.com\/)(\d+)/);
    if (vimeo) return { kind: "vimeo", src: `https://player.vimeo.com/video/${vimeo[1]}` };
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return { kind: "direct", src: url };
    return { kind: null, src: url };
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
            {hasTicketTypes ? (
              <>
                {Object.entries(cartItems).filter(([, q]) => q > 0).map(([tid, qty]) => {
                  const t = ticketTypes.find((t) => t.id === tid);
                  return (
                    <div key={tid} className="flex justify-between text-sm">
                      <span>{qty}× {t?.name}</span>
                      <span>{(t?.price ?? 0) > 0 ? `${(t?.price ?? 0) * qty} €` : "Gratuit"}</span>
                    </div>
                  );
                })}
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold text-sm">
                  <span>Total ({totalCartQty} place{totalCartQty > 1 ? "s" : ""})</span>
                  <span>{totalCartPrice > 0 ? `${totalCartPrice} €` : "Gratuit"}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span>{quantity} place{quantity > 1 ? "s" : ""}</span>
                  <span>{eventPrice > 0 ? `${eventPrice * quantity} €` : "Gratuit"}</span>
                </div>
                {eventPrice > 0 && (
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span>{eventPrice * quantity} €</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Nombre de places (uniquement pour événements sans types de billets) */}
          {!hasTicketTypes && (event.capacity === 0 || remaining > 1) && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">Nombre de places</p>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => handleQuantityChange(Math.max(1, quantity - 1))} disabled={quantity <= 1}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center font-semibold text-lg">{quantity}</span>
                <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => handleQuantityChange(Math.min(maxQty, quantity + 1))} disabled={quantity >= maxQty}>
                  <Plus className="h-4 w-4" />
                </Button>
                {event.capacity > 0 && (
                  <span className="text-xs text-muted-foreground">{remaining} place{remaining > 1 ? "s" : ""} disponible{remaining > 1 ? "s" : ""}</span>
                )}
              </div>
            </div>
          )}

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

          {/* Informations amis / places supplémentaires */}
          {friends.map((f, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-[#D5A0A8]/60 bg-[#FDFAF7] p-4">
              <p className="text-sm font-semibold text-[#72243E] flex items-center gap-2">
                <UserPlus className="h-4 w-4" />Ami(e) {i + 1}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Prénom *</Label>
                  <Input
                    value={f.prenom}
                    onChange={(e) => { const nf = [...friends]; nf[i] = { ...nf[i], prenom: e.target.value }; setFriends(nf); }}
                    placeholder="Sophie"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Nom *</Label>
                  <Input
                    value={f.nom}
                    onChange={(e) => { const nf = [...friends]; nf[i] = { ...nf[i], nom: e.target.value }; setFriends(nf); }}
                    placeholder="Martin"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email * <span className="text-xs text-muted-foreground font-normal">(recevra son billet par email)</span></Label>
                <Input
                  type="email"
                  value={f.email}
                  onChange={(e) => { const nf = [...friends]; nf[i] = { ...nf[i], email: e.target.value }; setFriends(nf); }}
                  placeholder="sophie.martin@email.com"
                />
              </div>
            </div>
          ))}

          {/* Document requis */}
          {event.required_document && (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-sm font-semibold">
                <FileText className="h-4 w-4 text-[#72243E]" />
                Document requis : <span className="text-[#72243E]">{event.required_document}</span>
              </Label>
              {docFile ? (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="flex-1 truncate text-sm text-emerald-700">{docFile.name}</span>
                  <button type="button" onClick={() => setDocFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-[#D5A0A8] bg-[#FDFAF7] px-4 py-5 transition-colors hover:border-[#72243E]">
                  <Upload className="h-5 w-5 text-[#72243E]" />
                  <span className="text-center text-xs text-[#72243E]">
                    Cliquer pour uploader votre <strong>{event.required_document}</strong>
                  </span>
                  <span className="text-[10px] text-muted-foreground">PDF, JPG, PNG — max 10 Mo</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </div>
          )}

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
                  <Label htmlFor="ccvv">Cryptogramme</Label>
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
            {totalCartPrice > 0 ? `Payer ${totalCartPrice} €` : `Confirmer ${totalCartQty > 1 ? `les ${totalCartQty} inscriptions` : "l'inscription"}`}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Paiement fictif — aucun prélèvement réel ne sera effectué.
          </p>
        </DialogContent>
      </Dialog>

      {/* Hero media carousel */}
      {(() => {
        const coverAlreadyInMedia = mediaItems.some((m) => m.url === event.cover_image_url);
        const allMedia = [
          ...(!coverAlreadyInMedia && event.cover_image_url ? [{ id: "cover", url: event.cover_image_url, type: "image", caption: "" }] : []),
          ...mediaItems,
        ];
        if (allMedia.length === 0) return <div className="h-2 w-full rounded-xl bg-gradient-vibrant" />;
        return (
          <div className="overflow-hidden rounded-2xl shadow-elegant">
            <div className="relative h-64 w-full bg-black sm:h-[500px]">
              {allMedia.map((m, i) => (
                <div
                  key={m.id || i}
                  className={`absolute inset-0 transition-opacity duration-700 ${i === activeMediaIdx ? "z-10 opacity-100" : "z-0 opacity-0"}`}
                >
                  {m.type === "image" ? (
                    <img src={m.url} alt={m.caption || event.title} className="h-full w-full object-cover" />
                  ) : (() => {
                    const embed = getEmbedUrl(m.url);
                    if (embed.kind === "youtube" || embed.kind === "vimeo") return (
                      <iframe src={embed.src} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    );
                    return <video src={m.url} controls className="h-full w-full bg-black object-contain" />;
                  })()}
                </div>
              ))}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-28 bg-gradient-to-b from-background to-transparent" />
              {/* Gradient + title overlay */}
              {allMedia[activeMediaIdx]?.type === "image" && (
                <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              )}
              <div className={`pointer-events-none absolute left-0 right-0 z-30 p-5 ${allMedia.length >= 2 ? "bottom-[72px]" : "bottom-0"}`}>
                <h1 className="text-3xl font-bold leading-tight text-white drop-shadow-md sm:text-4xl">{event.title}</h1>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/80">
                  <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{format(new Date(event.starts_at), "PPP à p", { locale: fr })}</span>
                  {event.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.location, event.city].filter(Boolean).join(", "))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pointer-events-auto flex items-center gap-1.5 hover:underline"
                    >
                      <MapPin className="h-3.5 w-3.5" />{event.location}
                    </a>
                  )}
                </p>
              </div>
              {/* Nav arrows */}
              {allMedia.length > 1 && (
                <>
                  <button
                    onClick={() => setActiveMediaIdx((i) => (i - 1 + allMedia.length) % allMedia.length)}
                    className="absolute left-3 top-1/2 z-40 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition-colors hover:bg-black/70"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setActiveMediaIdx((i) => (i + 1) % allMedia.length)}
                    className="absolute right-3 top-1/2 z-40 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition-colors hover:bg-black/70"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
              {/* Miniatures intégrées — fondu naturel via le dégradé de l'image */}
              {allMedia.length >= 2 && (
                <div className="absolute bottom-0 left-0 right-0 z-30 flex gap-1.5 overflow-x-auto px-2 py-2">
                  {allMedia.map((m, i) => (
                    <button
                      key={m.id || i}
                      onClick={() => setActiveMediaIdx(i)}
                      className={`h-14 w-20 shrink-0 overflow-hidden rounded border-2 transition-all ${i === activeMediaIdx ? "border-white opacity-100" : "border-transparent opacity-40 hover:opacity-70"}`}
                    >
                      {m.type === "image" ? (
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black">
                          <PlayCircle className="h-6 w-6 text-white/70" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Event card */}
      <Card className="overflow-hidden border-2 shadow-elegant">
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-3xl font-bold tracking-tight not-italic">{event.title}</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={shareEvent}>
                {copied ? <Check className="mr-2 h-4 w-4 text-emerald-500" /> : <Share2 className="mr-2 h-4 w-4" />}
                {copied ? "Copié !" : "Partager"}
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
            {event.required_document && (
              <Badge variant="outline" className="border-[#D5A0A8] text-[#72243E]">
                <FileText className="mr-1 h-3 w-3" />Document requis : {event.required_document}
              </Badge>
            )}
            {maxPerPerson > 0 && (
              <Badge variant="outline" className="border-[#D5A0A8] text-[#72243E]">
                <Users className="mr-1 h-3 w-3" />{maxPerPerson} place{maxPerPerson > 1 ? "s" : ""} max / personne
              </Badge>
            )}
          </div>

          {event.description ? (
            <p className="mt-4 text-base leading-relaxed whitespace-pre-line text-foreground/80">{event.description}</p>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground italic">Aucune description.</p>
          )}

          <div className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
            <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" />{format(new Date(event.starts_at), "PPP p", { locale: fr })}</div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              {event.location ? (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.location, event.city].filter(Boolean).join(", "))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline text-primary"
                >
                  {event.location}
                </a>
              ) : "En ligne"}
            </div>
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
                  const qty = cartItems[ticket.id] ?? 0;
                  return (
                    <div
                      key={ticket.id}
                      className={`flex items-center justify-between rounded-lg border-2 p-3 transition-all ${
                        qty > 0 ? "border-[#72243E] bg-[#EED4D8]/20" : isTicketFull ? "border-border opacity-60" : "border-border"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{ticket.name}</p>
                        {ticket.description && <p className="text-xs text-muted-foreground">{ticket.description}</p>}
                        <p className="mt-0.5 font-semibold text-sm text-[#72243E]">
                          {ticket.price > 0 ? `${ticket.price} €` : "Gratuit"}
                        </p>
                      </div>
                      <div className="ml-4 shrink-0">
                        {isTicketFull ? (
                          <Badge variant="destructive" className="text-xs">Complet</Badge>
                        ) : myReg || isOwner ? (
                          <p className="text-xs text-muted-foreground">
                            {!ticket.capacity ? "Illimité" : `${ticketRemaining} place${ticketRemaining > 1 ? "s" : ""}`}
                          </p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                              onClick={() => updateCartItem(ticket.id, qty - 1)} disabled={qty === 0}>
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="w-5 text-center text-sm font-semibold">{qty}</span>
                            <Button type="button" variant="outline" size="icon" className="h-7 w-7"
                              onClick={() => updateCartItem(ticket.id, qty + 1)} disabled={qty >= ticketRemaining || (maxPerPerson > 0 && totalCartQty >= maxPerPerson)}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {totalCartQty > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{totalCartQty} place{totalCartQty > 1 ? "s" : ""}</span>
                  <span className="font-semibold text-[#72243E]">{totalCartPrice > 0 ? `${totalCartPrice} €` : "Gratuit"}</span>
                </div>
              )}
            </div>
          ) : (
            eventPrice > 0 && <p className="mt-3 text-lg font-semibold text-[#72243E]">{eventPrice} €</p>
          )}

          {/* Actions */}
          <div className="mt-6 space-y-3">
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
                    disabled={acting || (hasTicketTypes && totalCartQty === 0)}
                    className="bg-gradient-primary shadow-glow"
                  >
                    <ShoppingCart className="mr-2 h-4 w-4" />
                    {hasTicketTypes && totalCartQty === 0 ? "Sélectionnez des places" : `Réserver${totalCartQty > 1 ? ` (${totalCartQty})` : ""}`}
                  </Button>
                )}
                {!myReg && isFull && (
                  <p className="text-sm text-muted-foreground">Cet événement est complet.</p>
                )}
                {(myReg || myGuestRegs.length > 0) && (
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                    <p className="text-sm font-semibold mb-3">Mes places</p>
                    {myReg && (
                      <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 border">
                        <div className="flex items-center gap-2 text-sm">
                          <Ticket className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium">Ma place</span>
                          <Badge variant="secondary" className={myReg.status === "attended" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}>
                            {myReg.status === "attended" ? "Présent" : "Confirmé"}
                          </Badge>
                        </div>
                        {myReg.status === "registered" && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive shrink-0" onClick={() => cancelRegistration(myReg.id, "moi")} disabled={acting}>
                            <XCircle className="h-4 w-4 mr-1" />Annuler
                          </Button>
                        )}
                      </div>
                    )}
                    {myGuestRegs.map((gr) => (
                      <div key={gr.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 border">
                        <div className="flex items-center gap-2 text-sm min-w-0">
                          <UserPlus className="h-4 w-4 text-[#72243E] shrink-0" />
                          <span className="font-medium truncate">{gr.guest_name}</span>
                          <Badge variant="secondary" className={gr.status === "attended" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}>
                            {gr.status === "attended" ? "Présent" : "Confirmé"}
                          </Badge>
                        </div>
                        {gr.status === "registered" && (
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive shrink-0" onClick={() => cancelRegistration(gr.id, gr.guest_name)} disabled={acting}>
                            <XCircle className="h-4 w-4 mr-1" />Annuler
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
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

      {/* QR codes des amis */}
      {myGuestRegs.length > 0 && (
        <Card className="border-2 shadow-elegant">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />Billets de vos amis ({myGuestRegs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {myGuestRegs.map((gr) => (
              <div key={gr.id} className="flex flex-col items-center gap-2 border-b pb-5 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-[#72243E]" />
                  <p className="font-semibold text-sm">{gr.guest_name}</p>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />{gr.guest_email} · billet envoyé par email
                </p>
                <div className="rounded-xl bg-white p-3 shadow-elegant">
                  <QRCodeCanvas value={gr.qr_code} size={140} />
                </div>
                <Badge className="capitalize"><CheckCircle2 className="mr-1 h-3 w-3" />Inscription confirmée</Badge>
                <code className="rounded bg-muted px-2 py-1 text-xs">{gr.qr_code}</code>
              </div>
            ))}
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
                        {r.document_url && (
                          <a href={r.document_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[#72243E] hover:underline mt-0.5">
                            <FileText className="h-3 w-3" />Voir le document
                          </a>
                        )}
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
