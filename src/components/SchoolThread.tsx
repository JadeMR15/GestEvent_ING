import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, CheckCheck, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { db, schoolErrorMessage, type SchoolMessage } from "@/lib/schools";
import { refreshNotifications, setActiveThread } from "@/lib/notifications";

type Message = SchoolMessage & { events?: { title: string } | null; pending?: boolean };

interface Props {
  associationId: string;
  /** Qui lit : l'école ou un membre de l'association (les bulles « à moi » sont à droite). */
  side: "school" | "association";
  schoolName?: string;
  associationName?: string;
  className?: string;
  /** Appelé après un envoi ou une lecture (pour rafraîchir la liste des conversations). */
  onActivity?: () => void;
}

function dayLabel(d: Date) {
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return "Hier";
  return format(d, "EEEE d MMMM yyyy", { locale: fr });
}

/** Conversation entre l'école et une association, façon messagerie. */
export function SchoolThread({ associationId, side, schoolName = "L'école", associationName = "L'association", className = "", onActivity }: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const onActivityRef = useRef(onActivity);
  onActivityRef.current = onActivity;

  const load = useCallback(async () => {
    const { data } = await db
      .from("school_messages")
      .select("*, events(title)")
      .eq("association_id", associationId)
      .order("created_at", { ascending: false })
      .limit(300);
    setMessages(((data as Message[] | null) ?? []).reverse());
    setLoading(false);
    // Lu seulement si la page est vraiment affichée (sinon la relance par email doit partir).
    if (document.visibilityState === "visible") {
      await db.rpc("mark_school_messages_read", { _association_id: associationId });
      refreshNotifications();
      onActivityRef.current?.();
    }
  }, [associationId]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setBody("");
    load();
  }, [load]);

  // Nouveaux messages en direct ; marqués lus au retour sur l'onglet.
  useEffect(() => {
    setActiveThread(associationId);
    const onMessage = (e: Event) => {
      if ((e as CustomEvent<{ association_id: string }>).detail.association_id === associationId) load();
    };
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("plav:new-message", onMessage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      setActiveThread(null);
      window.removeEventListener("plav:new-message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [associationId, load]);

  // Toujours en bas de la conversation.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, loading]);

  // Zone de saisie qui grandit avec le texte.
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [body]);

  async function send() {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    // Affiché tout de suite, confirmé par le rechargement.
    const temp: Message = {
      id: `temp-${Date.now()}`, school_id: "", association_id: associationId, event_id: null,
      sender_id: user?.id ?? null, from_school: side === "school", body: text, read_at: null,
      created_at: new Date().toISOString(), pending: true,
    };
    setMessages((prev) => [...prev, temp]);
    setBody("");
    const { error } = await db.rpc("send_school_message", { _association_id: associationId, _body: text });
    setSending(false);
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== temp.id));
      setBody(text);
      toast.error(schoolErrorMessage(error.message));
      return;
    }
    await load();
    input.current?.focus();
  }

  const mine = (m: Message) => (side === "school") === m.from_school;
  const lastMine = [...messages].reverse().find(mine);

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:20px_20px] px-3 py-4 md:px-6">
        {loading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary"><MessageSquare className="h-5 w-5" /></span>
            <p className="font-medium text-foreground">Aucun message pour l'instant</p>
            <p>{side === "school" ? `Écrivez le premier message à ${associationName}.` : `Écris le premier message à ${schoolName}.`}</p>
          </div>
        ) : (
          <ol className="space-y-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const date = new Date(m.created_at);
              const newDay = !prev || !isSameDay(new Date(prev.created_at), date);
              // Messages qui se suivent du même côté à moins de 5 min : groupés.
              const grouped = !newDay && prev && prev.from_school === m.from_school
                && date.getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
              const me = mine(m);
              return (
                <li key={m.id}>
                  {newDay && (
                    <div className="my-4 flex justify-center">
                      <span className="rounded-full border bg-card px-3 py-1 text-[11px] font-semibold capitalize text-muted-foreground shadow-sm">{dayLabel(date)}</span>
                    </div>
                  )}
                  <div className={`flex ${me ? "justify-end" : "justify-start"} ${grouped ? "" : "pt-2"}`}>
                    <div className={`max-w-[85%] md:max-w-[70%] ${me ? "items-end" : "items-start"} flex flex-col`}>
                      {!grouped && (
                        <span className="mb-1 px-1 text-[11px] font-semibold text-muted-foreground">
                          {me ? (side === "school" ? "Vous" : "Toi") : m.from_school ? schoolName : associationName}
                        </span>
                      )}
                      <div className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm ${me
                        ? `bg-primary text-primary-foreground ${grouped ? "rounded-tr-md" : "rounded-br-md"}`
                        : `border bg-card ${grouped ? "rounded-tl-md" : "rounded-bl-md"}`} ${m.pending ? "opacity-60" : ""}`}>
                        {m.event_id && m.events?.title && (
                          <Link to="/events/$eventId" params={{ eventId: m.event_id }}
                            className={`mb-1.5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ${me ? "bg-white/15 text-primary-foreground" : "bg-secondary text-primary"}`}>
                            <CalendarDays className="h-3.5 w-3.5" />{m.events.title}
                          </Link>
                        )}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <span className={`mt-0.5 block text-right text-[10px] ${me ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {m.pending ? "Envoi…" : format(date, "HH:mm")}
                        </span>
                      </div>
                      {me && m.id === lastMine?.id && m.read_at && (
                        <span className="mt-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
                          <CheckCheck className="h-3.5 w-3.5 text-primary" />Lu {format(new Date(m.read_at), "'le' d MMM 'à' HH:mm", { locale: fr })}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="border-t bg-card p-3 md:px-6">
        <div className="flex items-end gap-2 rounded-2xl border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
          <textarea
            ref={input}
            rows={1}
            maxLength={4000}
            placeholder={side === "school" ? `Écrire à ${associationName}…` : `Écrire à ${schoolName}…`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
            }}
            className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button onClick={send} disabled={sending || !body.trim()} size="icon" className="h-9 w-9 shrink-0 rounded-full" aria-label="Envoyer">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 hidden px-1 text-[11px] text-muted-foreground md:block">Entrée pour envoyer · Maj + Entrée pour aller à la ligne</p>
      </div>
    </div>
  );
}
