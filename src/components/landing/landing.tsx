"use client";
// The signed-out front page. One bold moment (the hero, where a told dream becomes a painting),
// then a quiet walk past what Dreamscape does with it. The sign-in form arrives as a slot.
import { useState } from "react";
import { Logo, LogoMark } from "../logo";
import { Moth } from "../moth";
import { ComicStrip } from "./comic-strip";
import { HeroStage } from "./hero-stage";
import { NamePlate, Sealed, VisitDoor, WorldDream } from "./scenes";
import "./landing.css";

const REPO = "https://github.com/Mithran-MV/dreamscape";

function goToSignIn(e: React.MouseEvent<HTMLAnchorElement>) {
  const slot = document.getElementById("sign-in");
  if (!slot) return;
  e.preventDefault();
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  slot.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  const first = slot.querySelector<HTMLElement>("button:not([disabled]), input, a[href], [tabindex]:not([tabindex='-1'])");
  (first ?? slot).focus({ preventScroll: true });
}

function Heading({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`font-display text-[clamp(1.9rem,4.4vw,2.9rem)] leading-[1.08] text-balance text-paper ${className}`}>{children}</h2>;
}

function Body({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`mt-4 text-[17px] leading-relaxed text-pretty text-mist ${className}`}>{children}</p>;
}

export function Landing({ signIn }: { signIn: React.ReactNode }) {
  const [take, setTake] = useState(0);

  return (
    <main className="ls-root w-full flex-1 overflow-x-clip">
      <section className="ls-hero mx-auto grid w-full max-w-6xl gap-x-14 px-5 pb-16 pt-6 sm:px-8 sm:pt-10 md:pb-24 md:pt-16">
        <div className="ls-hero-text">
          <div className="flex items-center justify-between gap-4">
            <Logo className="text-[1.75rem]" />
            {/* On a phone the form sits below the picture, so this jumps straight to it. */}
            <a href="#sign-in" onClick={goToSignIn} className="ls-press rounded-full border border-gold/50 px-4 py-2 text-sm text-gold md:hidden">
              Sign in
            </a>
          </div>
          <h1 className="mt-5 font-display text-[clamp(2.4rem,5vw,3.75rem)] leading-[1.04]">
            <span className="block text-balance text-mist/70">Your brain deletes your dreams.</span>
            <span className="block text-balance text-paper">Dreamscape keeps them.</span>
          </h1>
          <p className="mt-5 max-w-[34ch] text-[17px] leading-relaxed text-mist sm:mt-6 sm:text-lg">
            Ten seconds when you wake: hold, say it, done. A few minutes later it hangs in your gallery as a painting, with your voice kept beside it.
          </p>
        </div>

        <div id="sign-in" tabIndex={-1} className="ls-hero-slot w-full max-w-sm scroll-mt-24 focus:outline-none">
          {signIn}
        </div>

        <div className="ls-hero-stage mx-auto w-full max-w-[500px]">
          <HeroStage key={take} />
          <p className="ls-replay -mt-2 text-center">
            <button type="button" onClick={() => setTake((n) => n + 1)} className="rounded px-2 py-1 text-sm text-dim transition-colors hover:text-gold">
              Play it again
            </button>
          </p>
        </div>
      </section>

      <section className="ls-section mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="max-w-xl">
          <Heading>Overnight, a comic in your own words.</Heading>
          <Body className="max-w-[46ch]">
            While you sleep, Dreamscape turns your newest dream into a four-panel strip, and you approve it in the morning. Image models garble text, so the panels come back with no words in them. The app letters every caption and bubble itself, and the words stay exactly yours.
          </Body>
        </div>
        <div className="mt-10 md:mt-12">
          <ComicStrip />
          <p className="mt-4 text-sm text-dim">Made overnight by Dreamscape on 0G, from the dream at the top of this page. So is every picture here.</p>
        </div>
      </section>

      <section className="ls-section mx-auto grid w-full max-w-6xl items-center gap-10 px-5 sm:px-8 md:grid-cols-2 md:gap-16">
        <div>
          <Heading>Private by default.</Heading>
          <Body className="max-w-[40ch]">
            Your words, your voice and your paintings run through sealed AI inside an enclave on 0G. Dreamscape stores them encrypted on 0G Storage, and only you hold the key.
          </Body>
        </div>
        <Sealed />
      </section>

      <section className="ls-section mx-auto flex w-full max-w-3xl flex-col items-center px-5 text-center sm:px-8">
        <NamePlate />
        <Heading className="mt-14">Every piece is a name you own.</Heading>
        <Body className="max-w-[44ch]">
          Sell numbered editions in USDC. Each buyer gets their edition&rsquo;s name and the full piece. Give it away and access moves with it.
        </Body>
      </section>

      <section className="ls-section mx-auto grid w-full max-w-6xl items-center gap-12 px-5 sm:px-8 md:grid-cols-2 md:gap-16">
        <div className="md:order-2">
          <Heading>Let family visit for ten minutes.</Heading>
          <Body className="max-w-[42ch]">
            A pass is an ENS name that can&rsquo;t be transferred, so it stays with the person you gave it to. A visit is an Arkiv entry that expires on its own, so the door shuts on time and nobody has to lock it.
          </Body>
        </div>
        <VisitDoor />
      </section>

      <section className="ls-section mx-auto w-full max-w-4xl px-5 sm:px-8">
        <div className="mx-auto max-w-xl text-center">
          <Heading>What everyone dreamed.</Heading>
          <Body className="mx-auto max-w-[44ch]">
            Once a day, Dreamscape paints one picture from the themes everyone dreamed, never their words. A theme only counts once five dreamers share it.
          </Body>
        </div>
        <div className="mt-12">
          <WorldDream />
        </div>
      </section>

      <section className="ls-section mx-auto flex w-full max-w-2xl flex-col items-center px-5 text-center sm:px-8">
        <Heading>Keep tomorrow morning&rsquo;s dream.</Heading>
        <Body className="max-w-[36ch]">Sign in tonight. In the morning, hold the gold button and tell it.</Body>
        {/* The moth from the hero, asleep on the button until morning. */}
        <span className="relative mt-10 inline-block">
          <a
            href="#sign-in"
            onClick={goToSignIn}
            className="ls-press block rounded-xl bg-gold px-8 py-3.5 font-medium text-gold-ink shadow-[0_8px_30px_rgb(240_200_120/0.3)]"
          >
            Sign in
          </a>
          <Moth className="moth-rest absolute -right-7 -top-8 w-14 rotate-[14deg]" />
        </span>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 border-t border-edge px-5 py-8 text-sm text-dim sm:px-8">
        <p className="flex items-center gap-2.5">
          <LogoMark className="h-6 w-auto" />
          Built at ETHGlobal Mumbai on 0G, ENS and Arkiv
        </p>
        <a href={REPO} className="rounded text-mist underline decoration-line underline-offset-4 transition-colors hover:text-gold">
          Source on GitHub
        </a>
      </footer>
    </main>
  );
}
