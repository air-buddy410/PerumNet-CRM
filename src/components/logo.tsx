// Logo resmi PerumNet, diekstrak dari aset brand yang disediakan.
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <img src="/brand/perumnet-mark.png" className={`perumnet-logo-mark ${className}`} alt="" aria-hidden="true" />
  );
}

export function Logo({
  markClassName = "h-9 w-9",
  textClassName = "text-lg",
}: {
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className="perumnet-logo-lockup" aria-label="PerumNet">
      <LogoMark className={markClassName} />
      <img src="/brand/perumnet-wordmark.png" className={`perumnet-wordmark ${textClassName}`} alt="" aria-hidden="true" />
    </span>
  );
}
