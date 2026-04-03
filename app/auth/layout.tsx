// Force all /auth routes to render at request time, not build time.
// The Supabase client requires env vars that aren't available during static generation.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
