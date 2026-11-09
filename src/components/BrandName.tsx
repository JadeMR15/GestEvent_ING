export function BrandName({ className = "h-5" }: { className?: string }) {
  return <img src="/plav-logotype.svg" alt="Plav'" className={`inline-block w-auto object-contain ${className}`} />;
}
