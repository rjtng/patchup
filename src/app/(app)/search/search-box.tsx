"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { cn } from "@/lib/cn";

const searchHref = (text: string) => (text ? `/search?q=${encodeURIComponent(text)}` : "/search");

/** The search field: results follow as you type (after a short pause), and on Search. */
export function SearchBox({ query }: { query: string }) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  const [pending, startTransition] = useTransition();
  // When the search in the address changes some other way (a suggestion,
  // Back), show it. When it's one this box asked for, keep what's been typed
  // since: results can arrive after more typing.
  const [sent, setSent] = useState<string[]>([]);
  const [showing, setShowing] = useState(query);
  if (query !== showing) {
    setShowing(query);
    if (!sent.includes(query)) setValue(query);
  }

  useEffect(() => {
    const text = value.trim();
    if (text === query) return;
    const timer = setTimeout(() => {
      setSent((list) => [...list.slice(-4), text]);
      startTransition(() => router.replace(searchHref(text), { scroll: false }));
    }, 400);
    return () => clearTimeout(timer);
  }, [value, query, router]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = value.trim();
    setSent((list) => [...list.slice(-4), text]);
    startTransition(() => router.replace(searchHref(text), { scroll: false }));
    // Put the keyboard away, so the results can be seen.
    e.currentTarget.querySelector("input")?.blur();
  };

  return (
    <form role="search" onSubmit={onSubmit}>
      <label className="flex h-12 items-center gap-3 rounded-full bg-white px-4 text-ink">
        <Search aria-hidden className={cn("size-5 shrink-0 text-brand-navy", pending && "animate-pulse")} />
        <span className="sr-only">Search services and technicians</span>
        <input
          name="q"
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. aircon, leaking faucet, a name"
          maxLength={100}
          autoFocus={!query}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
        />
      </label>
    </form>
  );
}
