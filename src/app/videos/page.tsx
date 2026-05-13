import VideosGallery from "@/components/videos-gallery";
import { listAllVideos } from "@/lib/outfit_videos";
import { env } from "@/lib/env";

export const metadata = {
  title: "Videos — Drape",
  description:
    "Animated catalog videos generated from your saved outfits — fal.ai Seedance 2.0 / Kling 3.0 Pro.",
};

export const dynamic = "force-dynamic";

export default async function VideosPage() {
  const videos = env.supabase.isConfigured() ? await listAllVideos({ limit: 200 }) : [];

  return (
    <VideosGallery
      initialVideos={videos}
      supabaseReady={env.supabase.isConfigured()}
      videoProviderReady={env.fal.hasKey()}
    />
  );
}
