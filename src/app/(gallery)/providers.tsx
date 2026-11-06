"use client";
// Two ways in, one gallery. On localhost, 0G's own sign-in (0G's Privy app), which 0G allows only there:
// the dreamer's 0G account is who they are, and its iAI credit pays for their dreams. On the live site,
// Dreamscape's own Privy app with wallet login only, where the same wallet opens the same gallery.
import { PrivyProvider } from "@privy-io/react-auth";
import { createContext, useContext } from "react";
import { sepolia } from "viem/chains";

export type SignInKind = "0g" | "wallet";
const Kind = createContext<SignInKind>("0g");
export const useSignInKind = () => useContext(Kind);

// layout.tsx picks the app from the host, so each page starts Privy once, with the right one.
export function GallerySignIn({ kind, appId, children }: { kind: SignInKind; appId: string; children: React.ReactNode }) {
  return (
    <Kind.Provider value={kind}>
      <PrivyProvider
        appId={appId}
        config={{
          appearance: { theme: "dark", accentColor: "#f0c878", landingHeader: kind === "wallet" ? "Sign in with your wallet" : "Sign in with 0G" },
          // The wallet comes with the 0G account, or is the dreamer's own; Dreamscape never makes one.
          embeddedWallets: { ethereum: { createOnLogin: "off" } },
          defaultChain: sepolia,
          supportedChains: [sepolia],
        }}
      >
        {children}
      </PrivyProvider>
    </Kind.Provider>
  );
}
