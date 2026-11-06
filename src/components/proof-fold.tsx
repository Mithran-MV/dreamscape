// "How it was made": the proof behind a piece, folded away until someone asks for it.
// Closed, it shows one line saying what the proof covers.

export function ProofFold({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="fold panel mt-8">
      <summary className="group flex items-center justify-between gap-4 rounded-[1.25rem] px-5 py-4 transition-colors hover:bg-paper/[0.03]">
        <span className="min-w-0">
          <span className="block font-display text-title font-semibold">How it was made</span>
          <span className="mt-0.5 block text-ui text-mist">{summary}</span>
        </span>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-mist transition-colors group-hover:border-gold group-hover:text-gold" aria-hidden>
          <svg viewBox="0 0 24 24" className="fold-chevron h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div className="fold-body border-t border-edge px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}

// "Sealed by 0G, stored encrypted and recorded on-chain": only the parts this piece has.
export function proofLine(parts: (string | false | null | undefined)[]) {
  const said = parts.filter(Boolean) as string[];
  if (said.length === 0) return "";
  const line = said.length === 1 ? said[0] : `${said.slice(0, -1).join(", ")} and ${said[said.length - 1]}`;
  return line.charAt(0).toUpperCase() + line.slice(1);
}
