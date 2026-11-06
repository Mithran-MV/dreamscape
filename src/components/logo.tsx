// The Dreamscape mark, a gilt arched window with the moon over the sea, and the name beside it.
// The same shapes as assets/logo-mark.svg, so the tab icon and the page agree.
import { useId } from "react";

const ARCH = "M14 58V27a18 18 0 0 1 36 0v31z";

export function LogoMark({ className = "" }: { className?: string }) {
  // Ids are per instance: the mark can appear more than once on a page.
  const id = useId();
  const night = `${id}-night`;
  const arch = `${id}-arch`;
  const crescent = `${id}-crescent`;
  return (
    <svg viewBox="11 6 42 55" aria-hidden className={className}>
      <defs>
        <linearGradient id={night} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2156" />
          <stop offset="1" stopColor="#120e26" />
        </linearGradient>
        <clipPath id={arch}>
          <path d={ARCH} />
        </clipPath>
        <mask id={crescent}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx="38.2" cy="24.6" r="8.2" fill="#000" />
        </mask>
      </defs>
      <path d={ARCH} fill={`url(#${night})`} />
      <path d="M17.3 58V27a14.7 14.7 0 0 1 29.4 0v31" fill="none" stroke="var(--gold)" strokeOpacity="0.3" strokeWidth="0.7" />
      <g clipPath={`url(#${arch})`}>
        <circle cx="33" cy="29" r="9.2" fill="var(--gold)" mask={`url(#${crescent})`} />
        <circle cx="22.5" cy="23" r="1.3" fill="var(--paper)" />
        <circle cx="25" cy="36.5" r="0.9" fill="var(--paper)" opacity="0.8" />
        <path d="M12 49.5c5-4.2 9.6 1.8 15.2-1.6 5.4-3.3 9.4-4.6 14.6-1.2 3.6 2.3 7 1.4 10.2-0.4V62H12z" fill="var(--calm)" />
        <path d="M14 50.2c4.6-3.3 8.6 1.3 13.2-1.5 5-3.1 9-4.2 14.2-1" fill="none" stroke="var(--ok)" strokeWidth="1.3" strokeLinecap="round" />
      </g>
      <path d={ARCH} fill="none" stroke="var(--gold)" strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

// Sized by font size: the mark stands a little taller than the capitals.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.38em] ${className}`}>
      <LogoMark className="h-[1.3em] w-auto shrink-0" />
      <span className="font-display font-semibold italic leading-none tracking-[-0.01em] text-gold" style={{ fontVariationSettings: '"SOFT" 100, "WONK" 1' }}>
        Dreamscape
      </span>
    </span>
  );
}
