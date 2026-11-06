"use client";
// Two ways in, one gallery. On localhost, 0G's own sign-in (0G's Privy app), which 0G allows only there:
// the dreamer's 0G account is who they are, and its iAI credit pays for their dreams. On the live site,
// Dreamscape's own Privy app with wallet login only, where the same wallet opens the same gallery.
import { PrivyProvider } from "@privy-io/react-auth";
import { createContext, useContext } from "react";
import { sepolia } from "viem/chains";
import { useClientValue } from "@/lib/use-client-value";

export type SignInKind = "0g" | "wallet";
const Kind = createContext<SignInKind>("0g");
export const useSignInKind = () => useContext(Kind);

export function GallerySignIn({ zeroGAppId, walletAppId, children }: { zeroGAppId: string; walletAppId?: string; children: React.ReactNode }) {
  // The server renders 0G's sign-in; away from localhost the page switches to the wallet one once it loads.
  const kind = useClientValue<SignInKind>(() => (walletAppId && location.hostname !== "localhost" ? "wallet" : "0g"), "0g");
  const appId = kind === "wallet" && walletAppId ? walletAppId : zeroGAppId;
  return (
    <Kind.Provider value={kind}>
      <PrivyProvider
        key={appId}
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
