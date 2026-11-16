/**
 * Fond du hero : photo de soirée assombrie par un dégradé bordeaux 900,
 * cocotte géante qui tourne lentement (en pause hors de l'écran).
 *
 * Vidéo de fond : renseigner HERO_VIDEO_SRC (ex. "/soiree.mp4", fichier dans public/)
 * pour l'activer. Elle est muette, en boucle, avec la photo comme image de remplacement.
 * Tant que la valeur est null, seule la photo est affichée.
 */
const HERO_VIDEO_SRC: string | null = null;
const HERO_POSTER = "/cracki.webp";

export function HeroBackdrop({ playing }: { playing: boolean }) {
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
      <img
        src="/plav-cocotte.svg"
        alt=""
        className={`lp-hero-cocotte plav-drift ${playing ? "" : "lp-paused"}`}
      />
    </div>
  );
}
