"use client";

import { useEffect } from "react";
import { X, Download, ExternalLink } from "lucide-react";

export type LightboxItem = {
  url: string;
  alt: string;
  caption?: string;
};

export function Lightbox({
  item,
  onClose,
}: {
  item: LightboxItem | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [item, onClose]);

  if (!item) return null;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full max-w-7xl flex-col items-center gap-3"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.alt}
          className="max-h-[88vh] max-w-full rounded-lg object-contain shadow-2xl"
        />

        <div className="flex w-full items-center justify-between gap-3 text-xs text-white/80">
          <p className="truncate">{item.caption ?? item.alt}</p>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 transition hover:bg-white/20"
            >
              <ExternalLink className="size-3.5" /> Open
            </a>
            <a
              href={item.url}
              download
              className="flex items-center gap-1 rounded-md bg-white/10 px-2.5 py-1 transition hover:bg-white/20"
            >
              <Download className="size-3.5" /> Download
            </a>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/25"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
