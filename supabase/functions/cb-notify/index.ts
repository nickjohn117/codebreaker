// Sends a "your move" push notification to the opponent after a player acts.
// Auth: the caller's player secret must belong to a player in the game (no JWT needed).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
let vapidReady = false;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { secret, game, kind } = await req.json();
    if (typeof secret !== "string" || typeof game !== "string") return json({ error: "bad request" }, 400);

    const { data: me } = await db.from("cb_players").select("id,name").eq("secret", secret).maybeSingle();
    if (!me) return json({ error: "unknown player" }, 403);
    const { data: g } = await db.from("cb_games").select("id,p0,p1,status,turn,winner,resigned").eq("id", game).maybeSingle();
    if (!g || (g.p0 !== me.id && g.p1 !== me.id)) return json({ error: "not your game" }, 403);
    const seat = g.p0 === me.id ? 0 : 1;
    const oppId = seat === 0 ? g.p1 : g.p0;
    if (!oppId) return json({ sent: 0 });

    let body: string;
    if (g.status === "over") body = g.resigned ? `${me.name} gave up — you win!` : `${me.name} cracked your code. Game over!`;
    else if (kind === "join") body = `${me.name} joined your game. ${g.turn === seat ? "They go first." : "You go first!"}`;
    else if (kind === "rematch") body = `${me.name} wants a rematch — pick your new code.`;
    else if (kind === "code") body = g.status === "play" ? `${me.name} is ready. ${g.turn === seat ? "They go first." : "Your move!"}` : `${me.name} picked their code.`;
    else body = `${me.name} made a guess — your move!`;

    if (!vapidReady) {
      const { data: cfg } = await db.from("cb_config").select("key,value");
      const c = Object.fromEntries((cfg ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
      webpush.setVapidDetails(c.vapid_subject, c.vapid_public, c.vapid_private);
      vapidReady = true;
    }

    const { data: subs } = await db.from("cb_push").select("endpoint,p256dh,auth").eq("player_id", oppId);
    const payload = JSON.stringify({ title: "Codebreaker", body, game: g.id, tag: "cb-" + g.id });
    let sent = 0;
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("cb_push").delete().eq("endpoint", s.endpoint);
        else console.error("push failed", code, String(e));
      }
    }));
    return json({ sent });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
