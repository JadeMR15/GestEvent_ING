import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { db, schoolErrorMessage, type SchoolMessage } from "@/lib/schools";
import { refreshNotifications, setActiveThread } from "@/lib/notifications";

interface Props {
  associationId: string;
  /** Qui lit : l'école ou un membre de l'association (les bulles « à moi » sont à droite). */
  side: "school" | "association";
  schoolName?: string;
  associationName?: string;
}

/** Conversation entre l'école et une association. */
export function SchoolThread({ associationId, side, schoolName = "L'école", associationName = "L'association" }: Props) {
  const [messages, setMessages] = useState<(SchoolMessage & { events?: { title: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await db
      .from("school_messages")
      .select("*, events(title)")
      .eq("association_id", associationId)
      .order("created_at", { ascending: true })
      .limit(200);
    setMessages(data ?? []);
    setLoading(false);
    // Lu seulement si la page est vraiment affichée (sinon la relance par email doit partir).
    if (document.visibilityState === "visible") {
      await db.rpc("mark_school_messages_read", { _association_id: associationId });
      refreshNotifications();
    }
  }, [associationId]);

  useEffect(() => { load(); }, [load]);

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
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setSending(true);
    const { error } = await db.rpc("send_school_message", { _association_id: associationId, _body: text });
    setSending(false);
    if (error) { toast.error(schoolErrorMessage(error.message)); return; }
    setBody("");
    load();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-xl bg-muted/30 p-3">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucun message pour l'instant.</p>
        ) : (
          messages.map((m) => {
            const mine = (side === "school") === m.from_school;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                  <p className={`mb-0.5 text-[11px] font-semibold ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                    {m.from_school ? schoolName : associationName} · {format(new Date(m.created_at), "d MMM, HH:mm", { locale: fr })}
                  </p>
                  {m.event_id && m.events?.title && (
                    <Link to="/events/$eventId" params={{ eventId: m.event_id }}
                      className={`mb-1 block text-xs underline ${mine ? "text-primary-foreground/90" : "text-primary"}`}>
                      À propos de « {m.events.title} »
                    </Link>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-end gap-2">
        <Textarea
          rows={2}
          maxLength={4000}
          placeholder={side === "school" ? `Écrire à ${associationName}…` : `Écrire à ${schoolName}…`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
        />
        <Button onClick={send} disabled={sending || !body.trim()} size="icon" className="h-10 w-10 shrink-0" aria-label="Envoyer">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
