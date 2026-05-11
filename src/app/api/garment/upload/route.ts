/**
 * POST /api/garment/upload   (multipart/form-data)
 *
 * Form fields:
 *   - file: the product photo (jpeg / png / webp)
 *   - name: asset name
 *   - category: top | bottom | outer | dress | bag | shoes | accessory
 *
 * Critical path for the real client deliverable: the client has product
 * photos of actual garments and needs to drop them into the asset library
 * to plug into the Outfit Composer.
 */

import { NextResponse } from "next/server";
import { uploadAsset, type GarmentCategory } from "@/lib/assets";
import { env } from "@/lib/env";

const VALID_CATEGORIES: GarmentCategory[] = [
  "top",
  "bottom",
  "outer",
  "dress",
  "bag",
  "shoes",
  "accessory",
];

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB safety cap

export async function POST(req: Request) {
  if (!env.supabase.isConfigured() || !env.supabase.serviceRoleKey()) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to .env.local.",
      },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data body." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const nameField = form.get("name");
  const categoryField = form.get("category");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing or invalid `file` field." },
      { status: 400 },
    );
  }
  if (typeof nameField !== "string" || !nameField.trim()) {
    return NextResponse.json(
      { error: "Missing `name` field." },
      { status: 400 },
    );
  }
  if (
    typeof categoryField !== "string" ||
    !VALID_CATEGORIES.includes(categoryField as GarmentCategory)
  ) {
    return NextResponse.json(
      {
        error: `Missing or invalid \`category\`. Allowed: ${VALID_CATEGORIES.join(", ")}.`,
      },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${Math.round(file.size / 1024)} KB > 10 MB).` },
      { status: 400 },
    );
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: `Unsupported MIME type: ${file.type}.` },
      { status: 400 },
    );
  }

  try {
    const bytes = await file.arrayBuffer();
    const saved = await uploadAsset({
      name: nameField.trim(),
      type: "garment",
      bytes,
      contentType: file.type,
      metadata: {
        category: categoryField as GarmentCategory,
        source: "uploaded",
      },
    });
    return NextResponse.json(saved);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
