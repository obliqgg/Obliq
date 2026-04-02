import { redirect } from "next/navigation";
import { TerminalSurface } from "@/components/terminal-surface";
import { requireUser } from "@/lib/auth";
import { getDirectiveSurfaceRuntime, getPhaseStatusesForUser, recordSurfaceVisit } from "@/lib/product";

type DirectivePageProps = {
  params: Promise<{ slug: string }>;
};

function parseOpeningLines(raw: string) {
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default async function DirectivePage({ params }: DirectivePageProps) {
  const { slug } = await params;
  const user = await requireUser();
  if (!user.has_paid) {
    redirect("/archon");
  }

  const [phases, surfaceRuntime] = await Promise.all([
    getPhaseStatusesForUser(user.id, user.role === "admin"),
    getDirectiveSurfaceRuntime(slug),
  ]);
  const directive = phases.find((phase) => phase.slug === slug);
  const nextDirective = phases.filter((phase) => phase.number <= 2).find((phase) => !phase.isSolved);

  if (!directive || !surfaceRuntime) {
    redirect("/archon");
  }

  if (directive.isSolved) {
    redirect(`/archon?notice=${encodeURIComponent(surfaceRuntime.cleared_notice)}`);
  }

  if (nextDirective?.slug !== slug) {
    redirect("/archon");
  }

  await recordSurfaceVisit(user.id, `archon-${slug}`, slug);

  return (
    <main className="terminal-home-shell">
      <TerminalSurface
        fullHeight
        shell="directive"
        phaseSlug={slug}
        initialLines={parseOpeningLines(surfaceRuntime.opening_lines_json)}
      />
    </main>
  );
}
