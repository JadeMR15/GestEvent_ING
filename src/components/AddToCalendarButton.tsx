import { CalendarPlus, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type CalendarEvent, downloadIcs, googleCalendarUrl } from "@/lib/calendar";

interface Props {
  event: CalendarEvent;
  size?: "sm" | "default";
  className?: string;
  /** Texte du bouton ; « Agenda » dans les espaces étroits. */
  label?: string;
}

/** « Ajouter à mon agenda » : Google Agenda ou fichier .ics (Apple Calendrier, Outlook). */
export function AddToCalendarButton({ event, size = "sm", className, label = "Ajouter à mon agenda" }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className={className}>
          <CalendarPlus className="mr-2 h-4 w-4" />{label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            <CalendarPlus className="mr-2 h-4 w-4" />Google Agenda
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => downloadIcs(event)}>
          <Download className="mr-2 h-4 w-4" />Apple Calendrier, Outlook (.ics)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
