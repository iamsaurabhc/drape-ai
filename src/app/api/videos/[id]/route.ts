/**
 * DELETE /api/videos/[id]
 */

import { NextResponse } from "next/server";
import { deleteVideo } from "@/lib/outfit_videos";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing video id." }, { status: 400 });
  }
  try {
    await deleteVideo(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
