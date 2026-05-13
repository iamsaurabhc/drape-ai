/**
 * Higgsfield platform client.
 *
 * Higgsfield uses a queue-based async API (POST /{model_id} returns a
 * request_id, then you poll status_url until completed). This file wraps
 * that pattern into a single async helper per model so the rest of the app
 * can treat Higgsfield calls the same as fal `subscribe` calls.
 *
 * Docs: https://docs.higgsfield.ai/how-to/introduction
 */

import { env } from "@/lib/env";

const BASE_URL = "https://platform.higgsfield.ai";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type HiggsfieldStatus =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw";

interface HiggsfieldImage {
  url: string;
}

interface HiggsfieldSubmitResponse {
  status: HiggsfieldStatus;
  request_id: string;
  status_url: string;
  cancel_url: string;
}

interface HiggsfieldStatusResponse extends HiggsfieldSubmitResponse {
  images?: HiggsfieldImage[];
  video?: { url: string };
  error?: string;
}

// -----------------------------------------------------------------------------
// Auth
// -----------------------------------------------------------------------------

function authHeader(): string {
  return `Key ${env.higgsfield.apiKey()}:${env.higgsfield.apiSecret()}`;
}

// -----------------------------------------------------------------------------
// Low-level submit + poll
// -----------------------------------------------------------------------------

async function submit(
  modelId: string,
  body: Record<string, unknown>,
): Promise<HiggsfieldSubmitResponse> {
  const url = `${BASE_URL}/${modelId}`;
  console.log(`[higgsfield] POST ${modelId}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authHeader(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[higgsfield] submit ${modelId} failed: ${res.status} ${text.slice(0, 300)}`,
    );
    throw new Error(
      `Higgsfield submit failed (${res.status}): ${text.slice(0, 300) || res.statusText}`,
    );
  }
  const json = (await res.json()) as HiggsfieldSubmitResponse;
  console.log(
    `[higgsfield] ${modelId} submitted — request_id=${json.request_id} status=${json.status}`,
  );
  return json;
}

async function poll(
  statusUrl: string,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<HiggsfieldStatusResponse> {
  // Default 3 min for images; callers (video) bump this to 5 min for slower
  // models like Kling 2.1 Pro.
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 2000;
  const started = Date.now();
  let lastStatus = "";

  while (true) {
    const data = await fetchStatusOnce(statusUrl);

    if (data.status !== lastStatus) {
      console.log(
        `[higgsfield] status_url poll → status=${data.status} (t=${Math.round(
          (Date.now() - started) / 1000,
        )}s)`,
      );
      lastStatus = data.status;
    }

    if (data.status === "completed") return data;
    if (data.status === "failed") {
      throw new Error(`Higgsfield generation failed: ${data.error ?? "unknown reason"}`);
    }
    if (data.status === "nsfw") {
      throw new Error("Higgsfield rejected the prompt as NSFW.");
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `Higgsfield polling timed out after ${Math.round(timeoutMs / 1000)}s. ` +
          `Last status: ${data.status}.`,
      );
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

async function fetchStatusOnce(
  statusUrl: string,
): Promise<HiggsfieldStatusResponse> {
  const res = await fetch(statusUrl, {
    headers: { authorization: authHeader() },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Higgsfield status check failed (${res.status}): ${text.slice(0, 300) || res.statusText}`,
    );
  }
  return (await res.json()) as HiggsfieldStatusResponse;
}

// -----------------------------------------------------------------------------
// High-level: Soul (Standard) — Higgsfield's flagship hyperreal human model
// -----------------------------------------------------------------------------

export type HiggsfieldAspectRatio = "9:16" | "3:4" | "1:1" | "4:3" | "16:9";
export type HiggsfieldResolution = "720p" | "1080p";

export type HiggsfieldSoulInput = {
  prompt: string;
  aspectRatio?: HiggsfieldAspectRatio;
  resolution?: HiggsfieldResolution;
};

export type HiggsfieldSoulResult = {
  images: { url: string }[];
  requestId: string;
};

export async function generateSoulStandard(
  input: HiggsfieldSoulInput,
): Promise<HiggsfieldSoulResult> {
  const submission = await submit("higgsfield-ai/soul/standard", {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? "3:4",
    resolution: input.resolution ?? "1080p",
  });

  // Submission may already be "completed" if the API short-circuits cached
  // results — handle that fast-path without an extra poll.
  if (submission.status === "completed") {
    const completed = submission as HiggsfieldStatusResponse;
    return {
      images: completed.images ?? [],
      requestId: submission.request_id,
    };
  }

  const completed = await poll(submission.status_url);
  return {
    images: completed.images ?? [],
    requestId: submission.request_id,
  };
}

// -----------------------------------------------------------------------------
// Image-to-video used to live here, but we moved it to fal.ai entirely —
// see src/lib/fal-video.ts. Soul (Stage A character generation) is the only
// Higgsfield surface this app still hits.
// -----------------------------------------------------------------------------
