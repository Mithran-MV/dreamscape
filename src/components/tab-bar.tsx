"use client";
// The phone's bottom bar: the five places a dreamer goes most. On a laptop the top bar in
// components/app-shell.tsx does this job.
import Link from "next/link";

export type TabKey = "gallery" | "drafts" | "tell" | "market" | "passes";

const TABS: { key: TabKey; href: string; label: string; icon: React.ReactNode }[] = [
  {
    key: "gallery",
    href: "/",
    label: "Gallery",
    icon: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" />
        <rect x="13" y="13" width="7" height="7" rx="1" />
      </>
    ),
  },
  {
    key: "drafts",
    href: "/drafts",
    label: "Drafts",
    icon: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
        <path d="M12 4.5v15M3.5 12h17" />
      </>
    ),
  },
  { key: "tell", href: "/tell", label: "Tell", icon: <path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5Z" /> },
  { key: "market", href: "/market", label: "Market", icon: <path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5v10h16v-10M9 19.5v-5h6v5" /> },
  {
    key: "passes",
    href: "/passes",
    label: "Passes",
    icon: (
      <>
        <path d="M6 20V5.5A1.5 1.5 0 0 1 7.5 4h9A1.5 1.5 0 0 1 18 5.5V20" />
        <path d="M4 20h16M14.5 12.5v.01" />
      </>
    ),
  },
];

export function TabBar({ active, drafts = 0 }: { active?: TabKey; drafts?: number }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-ground/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const on = t.key === active;
          if (t.key === "tell") {
            return (
              <li key={t.key} className="flex justify-center">
                <Link href={t.href} aria-current={on ? "page" : undefined} className="press -mt-4 flex flex-col items-center gap-1 text-[13px] font-semibold text-gold">
                  <span className="sphere grid h-12 w-12 place-items-center rounded-full text-gold-ink">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                      {t.icon}
                    </svg>
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          }
          return (
            <li key={t.key}>
              <Link
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={`press relative flex flex-col items-center gap-1 px-1 pb-2.5 pt-3 text-[13px] font-semibold transition-colors ${on ? "text-gold" : "text-mist hover:text-paper"}`}
              >
                <span className={`absolute top-0 h-0.5 w-8 rounded-full bg-gold transition-opacity duration-150 ${on ? "opacity-100" : "opacity-0"}`} aria-hidden />
                <span className="relative">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill={on ? "currentColor" : "none"} fillOpacity={on ? 0.18 : 0} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden>
                    {t.icon}
                  </svg>
                  {t.key === "drafts" && drafts > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gold px-1 text-[11px] font-bold text-gold-ink">{drafts}</span>
                  )}
                </span>
                {t.label}
                {t.key === "drafts" && drafts > 0 && <span className="sr-only">, {drafts} waiting</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
