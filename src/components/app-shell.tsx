"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Shirt, Layers, Images } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/character", label: "Character", icon: User, available: true },
  { href: "/garments", label: "Garments", icon: Shirt, available: true },
  { href: "/composer", label: "Composer", icon: Layers, available: true },
  { href: "/batches", label: "Batches", icon: Images, available: false },
];

const GITHUB_URL = "https://github.com/your-org/drape";

function GithubIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.34.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.7 5.41-5.27 5.69.41.36.78 1.06.78 2.13v3.16c0 .31.21.68.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <nav className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/80 px-6 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
        <Link href="/" className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-gradient-to-br from-zinc-900 to-zinc-600" />
          <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Drape
          </span>
          <span className="hidden text-xs text-zinc-500 sm:inline">
            · AI fashion photos at batch scale
          </span>
        </Link>
        <ul className="flex items-center gap-1">
          {NAV.map((n) => {
            const active = pathname?.startsWith(n.href);
            return (
              <li key={n.href}>
                {n.available ? (
                  <Link
                    href={n.href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                      active
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                        : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900",
                    )}
                  >
                    <n.icon className="size-3.5" />
                    {n.label}
                  </Link>
                ) : (
                  <span
                    title="On the roadmap"
                    className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-400 dark:text-zinc-600"
                  >
                    <n.icon className="size-3.5" />
                    {n.label}
                    <span className="ml-0.5 rounded bg-zinc-100 px-1 text-[9px] font-bold uppercase text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500">
                      soon
                    </span>
                  </span>
                )}
              </li>
            );
          })}
          {/* <li className="ml-2 border-l border-zinc-200 pl-2 dark:border-zinc-800">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              title="View source on GitHub"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              <GithubIcon />
            </a>
          </li> */}
        </ul>
      </nav>
      <main className="flex-1">{children}</main>
      <footer className="mt-12 border-t border-zinc-200 bg-zinc-50 px-6 py-6 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <p>
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Drape
              </span>{" "}
            </p>
            <p className="text-[10px] text-zinc-400">
              Generate hyperreal models, generate garments, compose multi-garment outfits — at $0.06 per image.
            </p>
          </div>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <GithubIcon />
            <span>GitHub</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
