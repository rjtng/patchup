"use client";

import { SendHorizontal } from "lucide-react";
import { Fragment, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { CHAT_READ_EVENT, formatMessageDay, formatMessageTime, messageDay } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

type Message = { id: string; body: string; created_at: string; sender_id: string; removed_at?: string | null };
type Sending = { key: number; body: string; failed: boolean };

/**
 * The conversation and the box to write in. The page reloads `messages` from
 * the server whenever the chat hears of a new one (LiveUpdates); messages
 * sent from here show straight away.
 */
export function ChatThread({
  bookingId,
  me,
  otherId,
  otherFirstName,
  messages,
  closed,
}: {
  bookingId: string;
  me: string;
  otherId: string | null;
  otherFirstName: string;
  messages: Message[];
  closed: string | null;
}) {
  const [sent, setSent] = useState<Message[]>([]); // until the reloaded list has them
  const [sending, setSending] = useState<Sending[]>([]);
  const [draft, setDraft] = useState("");
  const nextKey = useRef(0);
  const end = useRef<HTMLDivElement>(null);
  const fieldId = useId();

  const loaded = new Set(messages.map((m) => m.id));
  const shown = [...messages, ...sent.filter((m) => !loaded.has(m.id))].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  // Keep the newest message in view.
  const count = shown.length + sending.length;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);

  // Seen: whenever something new arrives from them while the chat is on screen.
  const newestFromThem = messages.findLast((m) => m.sender_id !== me)?.id;
  useEffect(() => {
    const markRead = () => {
      if (document.visibilityState !== "visible") return;
      createClient()
        .rpc("mark_chat_read", { booking_id: bookingId })
        .then(() => window.dispatchEvent(new Event(CHAT_READ_EVENT)));
    };
    markRead();
    document.addEventListener("visibilitychange", markRead);
    return () => document.removeEventListener("visibilitychange", markRead);
  }, [bookingId, newestFromThem]);

  const send = async (body: string, key = nextKey.current++) => {
    setSending((list) => [...list.filter((s) => s.key !== key), { key, body, failed: false }]);
    const { data, error } = await createClient()
      .from("messages")
      .insert({ booking_id: bookingId, body })
      .select("id, body, created_at, sender_id")
      .single();
    if (error) {
      setSending((list) => list.map((s) => (s.key === key ? { ...s, failed: true } : s)));
      return;
    }
    setSending((list) => list.filter((s) => s.key !== key));
    setSent((list) => [...list, data]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    send(body);
  };

  // Enter sends; Shift+Enter starts a new line.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <>
      <div role="log" aria-label="Messages" className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-6">
        {shown.length === 0 && sending.length === 0 && !closed && (
          <p className="m-auto max-w-64 text-center text-sm text-muted">
            No messages yet. Ask {otherFirstName} anything about the job, like directions or parking.
          </p>
        )}
        {shown.map((m, i) => {
          const mine = m.sender_id === me;
          const newDay = i === 0 || messageDay(shown[i - 1].created_at) !== messageDay(m.created_at);
          return (
            <Fragment key={m.id}>
              {newDay && (
                <p className="my-2 text-center text-xs font-semibold text-muted">{formatMessageDay(m.created_at)}</p>
              )}
              <Bubble
                mine={mine}
                who={mine ? "You" : m.sender_id === otherId ? otherFirstName : "Earlier technician"}
                showWho={!mine && m.sender_id !== otherId}
                body={m.body}
                removed={Boolean(m.removed_at)}
                note={formatMessageTime(m.created_at)}
              />
            </Fragment>
          );
        })}
        {sending.map((s) => (
          <Bubble
            key={`sending-${s.key}`}
            mine
            who="You"
            body={s.body}
            note={
              s.failed ? (
                <button type="button" onClick={() => send(s.body, s.key)} className="font-semibold text-danger underline">
                  Not sent. Tap to try again
                </button>
              ) : (
                "Sending…"
              )
            }
          />
        ))}
        <div ref={end} />
      </div>

      {closed ? (
        <p className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] border-t border-line bg-surface px-6 py-4 text-center text-sm text-muted">
          {closed}
        </p>
      ) : (
        <form
          onSubmit={submit}
          className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 flex items-end gap-2 border-t border-line bg-surface px-4 py-3"
        >
          <label htmlFor={fieldId} className="sr-only">
            Message {otherFirstName}
          </label>
          <textarea
            id={fieldId}
            rows={1}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Message ${otherFirstName}`}
            className="field-sizing-content max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-field border-2 border-line bg-white px-4 py-2.5 text-base text-ink outline-none placeholder:text-muted/70 focus:border-brand-navy"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!draft.trim()}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-navy text-white transition-colors hover:bg-brand-navy-dark disabled:opacity-50"
          >
            <SendHorizontal aria-hidden className="size-5" />
          </button>
        </form>
      )}
    </>
  );
}

function Bubble({
  mine,
  who,
  showWho = false,
  body,
  removed = false,
  note,
}: {
  mine: boolean;
  who: string;
  showWho?: boolean;
  body: string;
  /** Removed by PatchUp (see set_message_removed): its text says so. */
  removed?: boolean;
  note: ReactNode;
}) {
  return (
    <div className={cn("flex max-w-[85%] flex-col gap-1", mine ? "items-end self-end" : "items-start self-start")}>
      {showWho && <span className="px-1 text-xs font-semibold text-muted">{who}</span>}
      <p
        className={cn(
          "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-base leading-snug",
          removed
            ? "border-2 border-dashed border-line italic text-muted"
            : mine
              ? "rounded-br-sm bg-brand-navy text-white"
              : "rounded-bl-sm bg-white text-ink shadow-sm",
        )}
      >
        {!showWho && <span className="sr-only">{who}: </span>}
        {body}
      </p>
      <span className="px-1 text-xs text-muted">{note}</span>
    </div>
  );
}
