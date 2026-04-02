import { TerminalSurface } from "@/components/terminal-surface";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/archon");
  }

  return (
    <main className="terminal-home-shell">
      <TerminalSurface fullHeight />
    </main>
  );
}
