// @ts-nocheck — Deno runtime, ignoré par tsc
// Mise en page commune des emails Plav', alignée sur la DA du site (src/styles.css) :
// fond crème, bordeaux, moutarde, titres en Fredoka, texte en DM Sans.
import { esc } from "./common.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://plavv.vercel.app";

export const C = {
  cream: "#FBF5EA",
  card: "#FFFDF8",
  ink: "#2B1A1F",
  burgundy: "#6B1A2F",
  burgundyDark: "#4A0F20",
  mustard: "#E8B22E",
  butter: "#F8E7B5",
  muted: "#7A5560",
  border: "#E8D6AE",
};

const BODY_FONT = "'DM Sans',Helvetica,Arial,sans-serif";
const TITLE_FONT = "'Fredoka','DM Sans',Helvetica,Arial,sans-serif";

export function emailButton(label: string, url: string) {
  return `<div style="text-align:center;margin:28px 0 8px">
    <a href="${esc(url)}" style="background:${C.burgundy};background-image:linear-gradient(135deg,#7C2238,#5A1426);color:${C.cream};padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;display:inline-block;font-size:15px;font-family:${BODY_FONT}">${esc(label)}</a>
  </div>`;
}

/** Encadré jaune beurre (infos de l'événement, motif d'un refus…). */
export function infoBox(html: string) {
  return `<div style="background:${C.butter};color:${C.burgundyDark};border-radius:12px;padding:16px;margin:16px 0">${html}</div>`;
}

/**
 * Email complet : logo, carte crème avec un liseré moutarde → bordeaux, titre optionnel,
 * contenu, bouton optionnel, et une ligne de pied (contact organisateur, etc.).
 */
export function emailLayout(opts: {
  title?: string;
  content: string;
  button?: { label: string; url: string };
  footer?: string;
}) {
  const title = opts.title
    ? `<h1 style="font-family:${TITLE_FONT};font-size:26px;font-weight:700;line-height:1.2;color:${C.burgundy};margin:0 0 20px">${esc(opts.title)}</h1>`
    : "";
  const footer = opts.footer
    ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid ${C.border};text-align:center;font-size:12px;color:${C.muted}">${opts.footer}</div>`
    : "";
  // Logo en PNG et non en SVG : Gmail et Outlook n'affichent pas les SVG (rendu depuis public/plav-logotype.svg).
  return `<div style="background:${C.cream};padding:24px 12px;font-family:${BODY_FONT};color:${C.ink};font-size:15px;line-height:1.55">
  <div style="max-width:560px;margin:0 auto">
    <div style="text-align:center;padding:4px 0 16px">
      <img src="${SITE_URL}/plav-logotype.png" width="130" alt="Plav'" style="display:inline-block;width:130px;height:auto;border:0" />
    </div>
    <div style="background:${C.card};border:1px solid ${C.border};border-radius:16px;overflow:hidden">
      <div style="height:6px;background:${C.mustard};background-image:linear-gradient(90deg,#F3D27A,#E8B22E 45%,#6B1A2F)"></div>
      <div style="padding:32px">
        ${title}
        ${opts.content}
        ${opts.button ? emailButton(opts.button.label, opts.button.url) : ""}
        ${footer}
      </div>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:${C.muted};text-align:center">Plav' · la billetterie étudiante</p>
  </div>
</div>`;
}
