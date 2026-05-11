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
  const res = await fetch(`${BASE_URL}/${modelId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: authHeader(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Higgsfield submit failed (${res.status}): ${text.slice(0, 300) || res.statusText}`,
    );
  }
  return res.json();
}

async function poll(
  statusUrl: string,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<HiggsfieldStatusResponse> {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const pollIntervalMs = opts.pollIntervalMs ?? 2000;
  const started = Date.now();

  while (true) {
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
    const data = (await res.json()) as HiggsfieldStatusResponse;

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
