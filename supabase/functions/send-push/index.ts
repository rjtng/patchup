// Sends PatchUp's phone notifications (Web Push). The database calls this
// when a notification is written for someone with notifications turned on;
// see supabase/migrations/*_notifications.sql and supabase/README.md.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle } from "./deliver.ts";

const secretKey: string =
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Who the push services can contact about these messages (RFC 8292).
const SUBJECT = "https://patchup-gules.vercel.app";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const request = await req.json().catch(() => ({}));
    return Response.json(await handle(request, { rpc: (fn, args) => supabase.rpc(fn, args), subject: SUBJECT }));
  } catch (error) {
    console.error("send-push failed:", error);
    return Response.json({ error: "Delivery failed" }, { status: 500 });
  }
});
