/**
 * DELETE /api/outfits/[id]
 */

import { NextResponse } from "next/server";
import { deleteOutfit } from "@/lib/outfits";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing outfit id." }, { status: 400 });
  }
  try {
    await deleteOutfit(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
