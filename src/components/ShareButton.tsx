import { useState } from "react";
import { Check, Link2, Mail, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ShareableEvent, eventShareContent, prefersNativeShare } from "@/lib/share";

interface ShareButtonProps {
  event: ShareableEvent;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Sur téléphone : menu de partage natif (WhatsApp, Messages, Mail…).
 * Sur ordinateur : petit menu WhatsApp · Email · Copier le lien.
 */
export function ShareButton({ event, size = "sm", className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const share = eventShareContent(event);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Lien copié.");
    } catch {
      toast.error("Impossible de copier le lien. Copie-le depuis la barre d'adresse.");
    }
  }

  const label = (
    <>
      {copied ? <Check className="mr-2 h-4 w-4 text-emerald-500" /> : <Share2 className="mr-2 h-4 w-4" />}
      {copied ? "Copié !" : "Partager"}
    </>
  );

  if (prefersNativeShare()) {
    return (
      <Button
        variant="outline"
        size={size}
        className={className}
        onClick={async () => {
          try { await navigator.share({ title: share.title, text: share.text, url: share.url }); }
          catch (e) { if ((e as Error).name !== "AbortError") await copyLink(); }
        }}
      >
        {label}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={className}>{label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <a href={share.whatsapp} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-2 h-4 w-4 text-[#25D366]" />WhatsApp
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={share.email}>
            <Mail className="mr-2 h-4 w-4" />Email
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyLink}>
          <Link2 className="mr-2 h-4 w-4" />Copier le lien
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
