import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getArtifactRuntime } from "@/lib/product";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const user = await getCurrentUser();
  if (!user?.has_paid) {
    return new NextResponse("entry required.", { status: 403 });
  }

  const { slug } = await context.params;
  const artifactRuntime = await getArtifactRuntime(slug);
  if (!artifactRuntime) {
    return new NextResponse("artifact unavailable", { status: 404 });
  }

  const basePath = path.join(process.cwd(), artifactRuntime.asset_path);
  const baseImage = await readFile(basePath);
  const tail = Buffer.from(artifactRuntime.payload_b64, "base64");
  const payload = Buffer.concat([baseImage, tail]);

  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": artifactRuntime.content_type,
      "Content-Disposition": `attachment; filename="${artifactRuntime.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
