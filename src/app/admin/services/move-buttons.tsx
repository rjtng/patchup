"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveService } from "./actions";

/** Moves a service up or down the list (and so on Home). */
export function MoveButtons({ id, name, first, last }: { id: string; name: string; first: boolean; last: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  const move = (direction: "up" | "down") =>
    startTransition(async () => {
      const { errors } = await moveService(id, direction);
      setFailed(errors?.form ?? null);
      router.refresh();
    });

  const button =
    "grid size-11 place-items-center rounded-full text-brand-navy hover:bg-brand-navy/5 disabled:text-line";
  return (
    <>
      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          aria-label={`Move ${name} up`}
          disabled={first || pending}
          onClick={() => move("up")}
          className={button}
        >
          <ChevronUp aria-hidden className="size-5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          aria-label={`Move ${name} down`}
          disabled={last || pending}
          onClick={() => move("down")}
          className={button}
        >
          <ChevronDown aria-hidden className="size-5" strokeWidth={2.5} />
        </button>
      </div>
      {failed && (
        <p role="alert" className="basis-full pb-2 pr-2 text-sm text-danger">
          {failed}
        </p>
      )}
    </>
  );
}
