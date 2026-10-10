// Called every minute by pg_cron (supabase/schema.sql): sends a push for each reminder that's due to every device
// of its owner. Deploy without JWT checks: it only sends what's already due, so calling it early does nothing.
//   supabase functions deploy send-reminders --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT ("mailto:you@example.com").
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async () => {
    // ponytail: claimed before sending, so a push that fails is not retried (a missed ring beats a double one)
    const { data: due, error } = await db.rpc("claim_due_reminders");
    if (error) return new Response(error.message, { status: 500 });
    if (!due.length) return new Response("0");

    const { data: subs, error: subsError } = await db.from("push_subscriptions").select("*")
        .in("user_id", [...new Set(due.map((r) => r.user_id))]);
    if (subsError) return new Response(subsError.message, { status: 500 });

    await Promise.all(due.flatMap((r) => subs.filter((s) => s.user_id === r.user_id).map((s) =>
        webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: r.body, body: r.title || "Noted", note: r.note_id }),
            { TTL: 3600, urgency: "high" },
        ).catch(async (e) => {
            // The app was removed from the home screen (or notifications turned off): that device is gone.
            if (e.statusCode === 404 || e.statusCode === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            else console.error(s.endpoint, e.statusCode, e.body);
        })
    )));
    return new Response(String(due.length));
});
