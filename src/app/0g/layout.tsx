import { ZeroGSignIn } from "./providers";

export default function ZeroGLayout({ children }: LayoutProps<"/0g">) {
  const appId = process.env.NEXT_PUBLIC_ZG_PRIVY_APP_ID;
  if (!appId) return <main className="p-8 text-center text-mist">Set NEXT_PUBLIC_ZG_PRIVY_APP_ID in .env.local to use the 0G sign-in.</main>;
  return <ZeroGSignIn appId={appId}>{children}</ZeroGSignIn>;
}
