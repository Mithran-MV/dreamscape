// The comic page. Panels arrive with no words in them and the top third left empty;
// the app letters the title, captions and bubbles itself, so every word is exactly the script's.
import { Patrick_Hand } from "next/font/google";
import { feelingColor } from "@/components/ui";

const lettering = Patrick_Hand({ weight: "400", subsets: ["latin"] });

export type ComicScript = { title: string; panels: { dialogue: { who: string; text: string }[]; caption: string | null }[] };

const INK = "#1d1a17";

function Bubble({ text, side }: { text: string; side: "left" | "right" }) {
  return (
    <div className={`relative max-w-[78%] ${side === "right" ? "ml-auto" : ""}`}>
      <p
        className="rounded-[50%] border-[0.6cqw] bg-white px-[5cqw] py-[3cqw] text-center text-[6.6cqw] uppercase leading-[1.05]"
        style={{ borderColor: INK }}
      >
        {text}
      </p>
      {/* the tail points down into the picture */}
      <svg viewBox="0 0 20 16" className={`absolute top-[calc(100%-0.7cqw)] w-[7cqw] ${side === "right" ? "right-[28%]" : "left-[28%]"}`} aria-hidden>
        <path d={side === "right" ? "M2 0 L14 15 L13 0" : "M18 0 L6 15 L7 0"} fill="white" stroke={INK} strokeWidth="1.6" strokeLinejoin="round" />
        <path d={side === "right" ? "M2.6 0 L13 0" : "M7.4 0 L17.4 0"} stroke="white" strokeWidth="2.2" />
      </svg>
    </div>
  );
}

export function ComicPage({ script, feeling, panelSrc, saga }: { script: ComicScript; feeling: string | null; panelSrc: (n: number) => string; saga?: string | null }) {
  const spot = feelingColor(feeling);
  return (
    <figure className={`${lettering.className} rounded-[3px] bg-[#fbf9f4] p-[3%] shadow-[0_18px_50px_rgb(0_0_0/0.45)]`} style={{ color: INK }}>
      <figcaption className="mb-[2.5%] flex items-end justify-between gap-4 px-[0.5%]">
        <span className="relative text-[clamp(22px,6vw,40px)] uppercase leading-none">
          {script.title}
          <svg viewBox="0 0 200 8" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-2 w-full" aria-hidden>
            <path d="M2 5 C60 1 120 7 198 3" stroke={spot} strokeWidth="4" fill="none" strokeLinecap="round" />
          </svg>
        </span>
        {saga && saga.toLowerCase() !== script.title.toLowerCase() && <span className="pb-0.5 text-[clamp(12px,2.6vw,16px)] opacity-70">{saga}</span>}
      </figcaption>

      <div className="grid grid-cols-2 gap-[2.2%]">
        {script.panels.map((p, i) => (
          <div key={i} className="@container relative aspect-square overflow-hidden border-[3px] bg-white" style={{ borderColor: INK }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request */}
            <img src={panelSrc(i)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-x-0 top-0 flex flex-col gap-[2.5cqw] p-[3cqw]">
              {p.caption && (
                <p className="-ml-[3cqw] -mt-[3cqw] max-w-[72%] self-start border-b-[0.6cqw] border-r-[0.6cqw] bg-[#fff1c1] px-[3cqw] py-[2cqw] text-[6cqw] uppercase leading-[1.08]" style={{ borderColor: INK }}>
                  {p.caption}
                </p>
              )}
              {p.dialogue.map((line, j) => (
                <Bubble key={j} text={line.text} side={j % 2 === 0 ? "left" : "right"} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}
