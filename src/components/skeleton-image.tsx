"use client";

/**
 * SkeletonImage — wraps a plain <img> with three UX upgrades:
 *
 *   - shimmering skeleton placeholder while the image is decoding
 *   - opacity fade-in once decoded (no flicker / no layout shift)
 *   - graceful "broken image" fallback when the URL 404s or CORS blocks
 *
 * Uses raw <img> on purpose: Next.js' <Image> needs every remote host
 * whitelisted via `next.config.ts`, and the Drape pipeline mixes Supabase
 * Storage, fal CDN, and Higgsfield CDN — adding all three to a whitelist is
 * fragile when CDN domains rotate.
 */

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function SkeletonImage({
  src,
  alt,
  className,
  imgClassName,
  objectFit = "cover",
  eager = false,
  onClick,
  title,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  objectFit?: "cover" | "contain";
  eager?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  const Wrapper = onClick ? "button" : "div";
  const isMissing = !src;

  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        "relative block overflow-hidden bg-zinc-100 dark:bg-zinc-900",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {/* shimmering placeholder */}
      {(state === "loading" || isMissing) && (
        <div
          aria-hidden
          className="absolute inset-0 animate-shimmer bg-[length:200%_100%] bg-gradient-to-r from-zinc-100 via-zinc-200/60 to-zinc-100 dark:from-zinc-900 dark:via-zinc-800/60 dark:to-zinc-900"
        />
      )}

      {/* error fallback */}
      {state === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-400 dark:text-zinc-600">
          <ImageOff className="size-6" />
          <span className="text-[10px] uppercase tracking-wider">unavailable</span>
        </div>
      )}

      {!isMissing && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
          className={cn(
            "h-full w-full transition-opacity duration-300",
            objectFit === "cover" ? "object-cover" : "object-contain",
            state === "loaded" ? "opacity-100" : "opacity-0",
            imgClassName,
          )}
        />
      )}
    </Wrapper>
  );
}
