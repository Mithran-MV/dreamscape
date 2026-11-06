"use client";
// The comic Dreamscape made overnight from the sample dream, on the app's own comic page: the panels
// came back from 0G with no words in them, and the page letters every caption and bubble itself.
// The panels and the script are real output, made by scripts/landing-art.ts.
import { ComicPage } from "../comic";
import made from "../../../public/landing/made.json";
import { useInView } from "./use-in-view";

export function ComicStrip() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-on={seen || undefined} className="ls-comic">
      <ComicPage script={made.comic.script} feeling={made.comic.feeling} panelSrc={(n) => `/landing/comic-${n + 1}.jpg`} strip />
    </div>
  );
}
