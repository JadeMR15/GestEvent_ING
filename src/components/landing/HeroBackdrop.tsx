/**
 * Fond du hero : photo de soirée très assombrie (~88 % de bordeaux 900),
 * pour que la cocotte et le mot géant ressortent.
 *
 * Vidéo de fond : renseigner HERO_VIDEO_SRC (ex. "/soiree.mp4", fichier dans public/)
 * pour l'activer. Elle est muette, en boucle, avec la photo comme image de remplacement.
 * Tant que la valeur est null, seule la photo est affichée.
 */
const HERO_VIDEO_SRC: string | null = null;
const HERO_POSTER = "/cracki.webp";

export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {HERO_VIDEO_SRC ? (
        <video
          className="lp-hero-media"
          src={HERO_VIDEO_SRC}
          poster={HERO_POSTER}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      ) : (
        <img className="lp-hero-media" src={HERO_POSTER} alt="" fetchPriority="high" />
      )}
      <div className="lp-hero-shade" />
    </div>
  );
}
