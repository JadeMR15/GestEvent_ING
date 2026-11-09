// onDark : version avec l'apostrophe dorée, sinon elle disparaît sur le bordeaux.
export function BrandName({ className = "h-5", onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <img
      src={onDark ? "/plav-logotype-dark.svg" : "/plav-logotype.svg"}
      alt="Plav'"
      className={`inline-block w-auto object-contain ${className}`}
    />
  );
}
