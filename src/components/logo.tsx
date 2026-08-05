// Logo PerumNet — rekreasi vektor dari logo resmi (wifi + atap + rumah).
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden="true">
      <path
        d="M74 64 A70 70 0 0 1 166 64"
        fill="none"
        stroke="#7d7d7d"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M95 89 A38 38 0 0 1 145 89"
        fill="none"
        stroke="#7d7d7d"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d="M40 190 L120 108 L200 190"
        fill="none"
        stroke="#1fb2a6"
        strokeWidth="27"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M75 192 L120 150 L165 192 L165 222 Q165 228 159 228 L135 228 L135 196 L105 196 L105 228 L81 228 Q75 228 75 222 Z"
        fill="#7d7d7d"
      />
    </svg>
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
    <span className="inline-flex items-center gap-2">
      <LogoMark className={markClassName} />
      <span className={`font-bold tracking-wide ${textClassName}`}>
        <span className="text-[#8b8b7b]">PERUM</span>
        <span className="text-[#1fb2a6]">NET</span>
      </span>
    </span>
  );
}
