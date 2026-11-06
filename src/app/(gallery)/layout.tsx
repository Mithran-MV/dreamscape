import { headers } from "next/headers";
import { Suspense } from "react";
import { GallerySignIn } from "./providers";

// 0G's sign-in works only on localhost, so the live site signs in with Dreamscape's own wallet app instead.
// The choice is made here, from the address the page was asked for: Privy keeps the first app it starts with.
export default function GalleryLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense>
      <SignInForHost>{children}</SignInForHost>
    </Suspense>
  );
}

async function SignInForHost({ children }: { children: React.ReactNode }) {
  const zeroGAppId = process.env.NEXT_PUBLIC_ZG_PRIVY_APP_ID;
  const walletAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const host = (await headers()).get("host") ?? "";
  const local = host === "localhost" || host.startsWith("localhost:");
  if (walletAppId && !local) return <GallerySignIn kind="wallet" appId={walletAppId}>{children}</GallerySignIn>;
  return zeroGAppId ? <GallerySignIn kind="0g" appId={zeroGAppId}>{children}</GallerySignIn> : <>{children}</>;
}
