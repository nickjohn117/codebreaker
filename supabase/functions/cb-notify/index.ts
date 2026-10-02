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
    const { data: g } = await db.from("cb_games").select("id,p0,p1,status,turn,winner,resigned,cracked,draw,mode,n0,n1").eq("id", game).maybeSingle();
    if (!g || (g.p0 !== me.id && g.p1 !== me.id)) return json({ error: "not your game" }, 403);
    const seat = g.p0 === me.id ? 0 : 1;
    const oppId = seat === 0 ? g.p1 : g.p0;
    if (!oppId) return json({ sent: 0 });

    const myN = seat === 0 ? g.n0 : g.n1;
    let body: string;
    if (g.status === "over" && g.mode === "race" && !g.resigned) body = g.winner === seat ? `${me.name} cracked your code first — they won the race!` : `You won the race!`;
    else if (g.status === "over" && g.mode === "playout" && !g.resigned) {
      body = g.draw ? `${me.name} cracked your code in ${myN} too — it's a tie!` : g.winner === seat ? `${me.name} cracked your code in ${myN} guesses — fewer than you. They win!` : `${me.name} cracked your code in ${myN} guesses — you win on fewer guesses!`;
    }
    else if (g.status === "over") {
      if (g.resigned) body = `${me.name} gave up — you win!`;
      else if (g.draw) body = `${me.name} cracked your code too — it's a tie!`;
      else if (g.winner === seat) body = `${me.name} cracked your code. Game over!`;
      else body = `${me.name} missed their last chance — you win!`;   // the sender just used their last-chance turn
    }
    else if (g.cracked === seat) body = `${me.name} cracked your code! Last chance — crack theirs to tie.`;
    else if (g.mode === "playout" && kind === "guess" && myN !== null) body = `${me.name} cracked your code in ${myN} guesses! Keep going — beat or match ${myN} to win or tie.`;
    else if (g.mode === "race" && kind === "join") body = `${me.name} joined your race! Open the game — it starts when you're both on it.`;
    else if (g.mode === "race" && kind === "ready") body = `${me.name} is ready to race! Open the game to start.`;
    else if (g.mode === "race" && kind === "code") body = g.status === "play" ? `${me.name} is ready for the rematch race! Open the game to start.` : `${me.name} picked their code.`;
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
