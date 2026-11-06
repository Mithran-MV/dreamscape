"use client";
// The frame around every signed-in page: a top bar on a laptop, a small header and the tab bar on a phone,
// and the dreamer's session for any page that wants it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { api } from "@/lib/api";
import { inApp, onReminderTap, remindEachMorning, reminderOn } from "@/lib/native";
import { Logo } from "@/components/logo";
import { TabBar, type TabKey } from "@/components/tab-bar";
import { FEELINGS } from "@/components/ui";

export type SessionUser = { handle: string; wallet: string | null; ensName: string | null; naming: boolean };
export type NavKey = "gallery" | "drafts" | "tell" | "market" | "world" | "passes" | "settings";

const Session = createContext<{ user: SessionUser | null | undefined; signOut: () => void }>({ user: undefined, signOut: () => undefined });
// user is undefined while the session loads, and null when nobody is signed in.
export const useSessionUser = () => useContext(Session).user;
export const useSignOut = () => useContext(Session).signOut;

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "gallery", href: "/", label: "Gallery" },
  { key: "drafts", href: "/drafts", label: "Drafts" },
  { key: "market", href: "/market", label: "Night Market" },
  { key: "world", href: "/world", label: "World Dream" },
  { key: "passes", href: "/passes", label: "Passes" },
  { key: "settings", href: "/settings", label: "Settings" },
];

const TAB_FOR: Partial<Record<NavKey, TabKey>> = { gallery: "gallery", drafts: "drafts", tell: "tell", market: "market", passes: "passes" };

// The same handle always lands on the same Dream Weather colour.
export function handleColor(handle: string) {
  let h = 0;
  for (const c of handle) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FEELINGS[h % FEELINGS.length].color;
}

export function AppShell({
  active,
  user: given,
  drafts: givenDrafts,
  privyLogout = true,
  children,
}: {
  active?: NavKey;
  // Pages that already load the session (or the drafts) pass them in; otherwise the shell asks.
  user?: SessionUser | null;
  drafts?: number;
  // The /0g page signs in with 0G's own Privy app, so signing out of Dreamscape leaves that one alone.
  privyLogout?: boolean;
  children: React.ReactNode;
}) {
  const [fetched, setFetched] = useState<SessionUser | null | undefined>(undefined);
  const [fetchedDrafts, setFetchedDrafts] = useState(0);
  const { logout } = usePrivy();
  const router = useRouter();
  useEffect(() => {
    if (given !== undefined) return;
    api.session().then((r) => setFetched(r.user), () => setFetched(null));
  }, [given]);
  const user = given !== undefined ? given : fetched;

  useEffect(() => {
    if (!user || givenDrafts !== undefined) return;
    api.episodes().then((r) => setFetchedDrafts(r.episodes.filter((e) => e.status === "draft").length), () => undefined);
  }, [user, givenDrafts]);
  const drafts = givenDrafts ?? fetchedDrafts;

  // In the phone app a tapped morning reminder opens Tell, and the reminder moves with the dreamer's usual time.
  useEffect(() => (inApp() ? onReminderTap((url) => router.push(url)) : undefined), [router]);
  useEffect(() => {
    if (!user || !inApp()) return;
    reminderOn()
      .then((on) => (on ? api.mornings().then((m) => remindEachMorning(m.wake)) : undefined))
      .catch(() => undefined);
  }, [user]);

  // Signed out, the wall becomes the landing page again; on the wall itself, a reload does that.
  const signOut = () =>
    Promise.all([api.signOut(), privyLogout ? logout().catch(() => undefined) : undefined]).then(() =>
      window.location.pathname === "/" ? window.location.reload() : router.replace("/"),
    );

  return (
    <Session.Provider value={{ user, signOut }}>
      <div className="app-shell flex w-full flex-1 flex-col">
        <a href="#content" className="sr-only z-50 rounded-full bg-gold px-4 py-2 font-semibold text-gold-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
          Skip to the page
        </a>
        <TopBar active={active} user={user} drafts={drafts} onSignOut={signOut} />
        <div id="content" className="mx-auto w-full max-w-7xl flex-1 px-5 pb-32 pt-6 md:px-8 lg:pb-24 lg:pt-10">
          {children}
        </div>
        {user && <TabBar active={active ? TAB_FOR[active] : undefined} drafts={drafts} />}
      </div>
    </Session.Provider>
  );
}

function TopBar({ active, user, drafts, onSignOut }: { active?: NavKey; user: SessionUser | null | undefined; drafts: number; onSignOut: () => void }) {
  return (
    <header className="z-40 border-b border-edge/80 bg-ground/80 backdrop-blur-md lg:sticky lg:top-0">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-5 md:px-8 xl:gap-8">
        <Link href="/" aria-label="Dreamscape, your gallery" className="press shrink-0 rounded">
          <Logo className="text-[1.45rem]" />
        </Link>
        {user && (
          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center">
              {NAV.map((n) => {
                const on = n.key === active;
                return (
                  <li key={n.key}>
                    <Link
                      href={n.href}
                      aria-current={on ? "page" : undefined}
                      className={`press relative flex h-16 items-center gap-2 px-2.5 text-ui font-semibold transition-colors xl:px-3 ${on ? "text-paper" : "text-mist hover:text-paper"}`}
                    >
                      {n.label}
                      {n.key === "drafts" && drafts > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1.5 text-[12px] font-bold tabular-nums text-gold-ink">
                          {drafts}
                          <span className="sr-only"> waiting</span>
                        </span>
                      )}
                      <span className={`absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-gold transition-opacity duration-150 ${on ? "opacity-100" : "opacity-0"}`} aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}

        <div className="ml-auto flex items-center gap-3">
          {user === null && (
            <Link href="/" className="btn btn-gold btn-sm">
              Sign in
            </Link>
          )}
          {user && (
            <>
              <Link href="/tell" className={`btn btn-gold btn-sm hidden lg:inline-flex ${active === "tell" ? "ring-2 ring-gold/40 ring-offset-2 ring-offset-ground" : ""}`}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5Z" />
                </svg>
                Tell a dream
              </Link>
              <ProfileMenu user={user} onSignOut={onSignOut} />
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function ProfileMenu({ user, onSignOut }: { user: SessionUser; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const name = user.ensName ?? user.handle;

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const item = "flex w-full rounded-xl px-3 py-2.5 text-left text-ui font-semibold transition-colors hover:bg-paper/5";
  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="profile-menu"
        aria-label={`Your profile, ${name}`}
        className="press flex items-center gap-2.5 rounded-full border border-line bg-card/70 py-1 pl-1 pr-3 transition-colors hover:border-gold"
      >
        <Avatar handle={user.handle} />
        <span className={`hidden max-w-56 truncate sm:block lg:hidden xl:block ${user.ensName ? "font-mono text-meta text-gold" : "text-ui font-semibold text-paper"}`}>{name}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 text-mist transition-transform duration-200 ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div id="profile-menu" className="menu panel absolute right-0 top-full z-50 mt-2 w-72 bg-card p-2 shadow-[0_24px_60px_rgb(0_0_0/0.6)]">
          <div className="flex items-center gap-3 px-3 pb-3 pt-2">
            <Avatar handle={user.handle} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-paper">{user.handle}</p>
              {user.ensName ? (
                <p className="truncate font-mono text-meta text-gold">{user.ensName}</p>
              ) : (
                <p className="text-meta text-dim">{user.naming ? `Naming ${user.handle}.dream-scape.eth` : "No ENS name"}</p>
              )}
            </div>
          </div>
          <div className="border-t border-edge pt-2" onClick={() => setOpen(false)}>
            <Link href="/settings" className={`${item} text-paper`}>
              Settings
            </Link>
            <Link href="/world" className={`${item} text-paper lg:hidden`}>
              World Dream
            </Link>
            <Link href="/0g" className={`${item} text-paper`}>
              0G credit
            </Link>
            <button onClick={onSignOut} className={`${item} text-mist hover:text-paper`}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Avatar({ handle, size = "h-8 w-8 text-lead" }: { handle: string; size?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-display font-semibold italic text-paper ${size}`} style={{ background: handleColor(handle) }} aria-hidden>
      {handle.charAt(0).toUpperCase()}
    </span>
  );
}
