import type { ReactNode } from "react";
import { Calendar, MousePointerClick, QrCode, ScanLine } from "lucide-react";
import { FakeQr, Reveal } from "./Motion";
import { useInView } from "./hooks";

/** Section « l'appli » : téléphone en HTML/CSS qui flotte + trois points clés. */
export function AppShowcase({ children }: { children?: ReactNode }) {
  const { ref, visible } = useInView(0, false);
  const listAnim = useInView<HTMLUListElement>(0.2);
  const points = [
    { icon: MousePointerClick, label: "Réserve en un clic" },
    { icon: QrCode, label: "Ton QR code toujours sur toi" },
    { icon: ScanLine, label: "Entre en deux secondes" },
  ];

  return (
    <section id="application" className="lp-app relative overflow-hidden scroll-mt-24 py-24 md:py-32">
      <div className="container mx-auto grid items-center gap-16 px-4 sm:px-6 md:grid-cols-2">
        {/* Téléphone (décoratif) */}
        <div ref={ref} className="relative flex justify-center" aria-hidden="true">
          <div className="lp-app-halo" />
          <div className={`lp-phone-float ${visible ? "" : "is-paused"}`}>
            <div className="lp-phone">
              <div className="lp-phone-notch" />
              <div className="lp-phone-screen">
                <div className="lp-ticket">
                  <div className="lp-ticket-visual">
                    <img src="/cracki.webp" alt="" loading="lazy" />
                    <span className="lp-ticket-badge">Soirée</span>
                  </div>
                  <div className="lp-ticket-body">
                    <p className="lp-ticket-title">Gala de printemps</p>
                    <p className="lp-ticket-meta"><Calendar className="h-4 w-4" />Sam. 14 mars · 22:00</p>
                  </div>
                  <div className="lp-ticket-sep ticket-notch" />
                  <div className="lp-ticket-qr">
                    <FakeQr className="h-full w-full" />
                  </div>
                  <div className="lp-ticket-btn">Voir mon billet</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Texte */}
        <div>
          <Reveal>
            <h2 className="lp-section-title text-encre">
              Ton billet, <span className="t-accent plav-highlight text-bordeaux-600">dans ta poche.</span>
            </h2>
          </Reveal>
          <ul ref={listAnim.ref} className="mt-10 space-y-5">
            {points.map((p, i) => (
              <li
                key={p.label}
                className={`lp-reveal flex items-center gap-4 ${listAnim.visible ? "is-in" : ""}`}
                style={{ animationDelay: `${120 + i * 100}ms` }}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-moyen)] bg-bordeaux-100 text-bordeaux-600">
                  <p.icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <span className="t-sous-titre text-encre">{p.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* Emplacement en bas à gauche, dans la marge du bas (plongeoir de Cocotte) */}
      {children && <div className="container relative mx-auto h-0 px-4 sm:px-6"><div className="relative">{children}</div></div>}
    </section>
  );
}
