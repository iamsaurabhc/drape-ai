/**
 * /api/assets/[id]
 *
 *   DELETE — removes an asset row + its underlying Storage object.
 *   PATCH  — { isPinned: boolean } toggles the recurring-model pin flag.
 *
 * The Composer uses PATCH to surface a small set of pinned characters at
 * the top of the picker (the brief specifies 6 recurring faces reused
 * across the 650-image eyewear catalogue).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteAsset, setAssetPinned } from "@/lib/assets";
import { env } from "@/lib/env";

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

const PatchBody = z.object({
  isPinned: z.boolean(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing asset id." }, { status: 400 });
  }
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return NextResponse.json(
      { error: "Supabase must be configured to pin assets." },
      { status: 400 },
    );
  }

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request body." },
      { status: 400 },
    );
  }

  try {
    const updated = await setAssetPinned(id, body.isPinned);
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
