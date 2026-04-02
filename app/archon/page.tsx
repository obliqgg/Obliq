import { TerminalSurface } from "@/components/terminal-surface";
import { requireUser } from "@/lib/auth";

function getArchonIntro(hasPaid: number, notice?: string) {
  const lines = notice ? [notice, ""] : [];

  if (hasPaid) {
    return [
      ...lines,
      "access granted. archon awaits.",
    ];
  }

  return [
    ...lines,
    "access granted. archon awaits.",
    "",
    "to proceed, you must connect your wallet and deposit 100,000 $OBLIQ.",
    "type connect to continue or help for other options",
  ];
}

type ArchonPageProps = {
  searchParams: Promise<{ notice?: string }>;
};

export default async function ArchonPage({ searchParams }: ArchonPageProps) {
  const { notice } = await searchParams;
  const user = await requireUser();

  return (
    <main className="terminal-home-shell">
      <TerminalSurface fullHeight shell="archon" initialLines={getArchonIntro(user.has_paid, notice)} />
    </main>
  );
}
