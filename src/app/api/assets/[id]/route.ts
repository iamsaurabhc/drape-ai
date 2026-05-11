/**
 * DELETE /api/assets/[id]
 *
 * Removes an asset row + its underlying Storage object. Used by the Garment
 * Library to clean up unwanted generations without leaving orphan files in
 * the bucket.
 */

import { NextResponse } from "next/server";
import { deleteAsset } from "@/lib/assets";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing asset id." }, { status: 400 });
  }
  try {
    await deleteAsset(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
