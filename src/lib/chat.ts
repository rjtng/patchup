// Chat times, in Manila time like the rest of the app.
const TIME_ZONE = "Asia/Manila";

const time = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, weekday: "short", month: "short", day: "numeric" });
const shortDay = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, month: "short", day: "numeric" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** "10:04 AM" */
export const formatMessageTime = (iso: string) => time.format(new Date(iso));

/** "Sun, Oct 18": the heading over a day's messages. */
export const formatMessageDay = (iso: string) => day.format(new Date(iso));

/** The Manila calendar day, "2026-10-18", for grouping messages by day. */
export const messageDay = (iso: string) => dayKey.format(new Date(iso));

/** For the chat list: the time if it was today, else the date ("Oct 17"). */
export function formatLastMessage(iso: string, now: number) {
  return messageDay(iso) === dayKey.format(now) ? time.format(new Date(iso)) : shortDay.format(new Date(iso));
}

/** "Tess Cruz" -> "Tess" */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Sent on window when a chat is marked read, so the Chat tab's count updates. */
export const CHAT_READ_EVENT = "patchup:chat-read";
