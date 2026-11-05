"use client";
// The phone's bottom bar. On wider screens the gallery's own "Tell last night's dream" button does this job.
import Link from "next/link";

const TABS = [
  {
    key: "today",
    href: "/tell",
    label: "Today",
    icon: <path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5Z" />,
  },
  {
    key: "wall",
    href: "/",
    label: "Wall",
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
    key: "comics",
    href: "/#comics",
    label: "Comics",
    icon: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
        <path d="M12 4.5v15M3.5 12h17" />
      </>
    ),
  },
] as const;

export function TabBar({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-edge bg-ground/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-md justify-around">
        {TABS.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={t.key === active ? "page" : undefined}
              className={`flex flex-col items-center gap-1 px-5 py-2.5 text-[11px] ${t.key === active ? "text-gold" : "text-dim"}`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
                {t.icon}
              </svg>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
