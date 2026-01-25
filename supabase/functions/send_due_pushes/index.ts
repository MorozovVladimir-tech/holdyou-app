import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isLikelyExpoToken(token: string) {
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method Not Allowed" }, 405);

  // защита от публичного дергания
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const incomingSecret = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && incomingSecret !== CRON_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(
      {
        error: "Missing env",
        details: "Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Edge Functions → Secrets",
      },
      500,
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // 1) релизный due-срез (timezone + антиспам по last_sent_at)
    const { data: schedules, error: schErr } = await supabase
      .from("v_due_schedules")
      .select("id, user_id, label");

    if (schErr) return json({ error: "due_select_failed", details: schErr }, 500);
    if (!schedules || schedules.length === 0) return json({ ok: true, due: 0 });

    const results: any[] = [];

    for (const sch of schedules as any[]) {
      const scheduleId = sch.id as string;
      const userId = sch.user_id as string;
      const scheduleLabel = (sch.label ?? "unknown") as string;

      // 2) token
      const { data: tokenRow, error: tokErr } = await supabase
        .from("user_push_tokens")
        .select("expo_push_token")
        .eq("user_id", userId)
        .maybeSingle();

      const expoPushToken = tokenRow?.expo_push_token ?? null;

      const bumpLastSent = async () => {
        await supabase
          .from("notification_schedules")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", scheduleId);
      };

      if (tokErr || !expoPushToken) {
        await supabase.from("push_delivery_logs").insert({
          user_id: userId,
          schedule_label: scheduleLabel,
          expo_push_token: null,
          title: "HOLDYOU",
          body: "",
          data: { screen: "talk", userId, source: "ai_push", scheduleLabel, reason: "missing_token" },
          expo_ticket: null,
          status: "no_token",
          error: tokErr ? JSON.stringify(tokErr) : "missing expo_push_token",
          created_at: new Date().toISOString(),
        });

        await bumpLastSent();
        results.push({ userId, scheduleId, scheduleLabel, status: "no_token" });
        continue;
      }

      if (!isLikelyExpoToken(expoPushToken)) {
        await supabase.from("push_delivery_logs").insert({
          user_id: userId,
          schedule_label: scheduleLabel,
          expo_push_token: expoPushToken,
          title: "HOLDYOU",
          body: "",
          data: { screen: "talk", userId, source: "ai_push", scheduleLabel, reason: "bad_token_format" },
          expo_ticket: null,
          status: "bad_token",
          error: "expo_push_token does not look like Expo token",
          created_at: new Date().toISOString(),
        });

        await bumpLastSent();
        results.push({ userId, scheduleId, scheduleLabel, status: "bad_token" });
        continue;
      }

      // 3) sender profile (минимум)
      const { data: profileRow, error: profErr } = await supabase
        .from("sender_profiles")
        .select("name, user_name")
        .eq("user_id", userId)
        .maybeSingle();

      if (profErr || !profileRow) {
        await supabase.from("push_delivery_logs").insert({
          user_id: userId,
          schedule_label: scheduleLabel,
          expo_push_token: expoPushToken,
          title: "HOLDYOU",
          body: "",
          data: { screen: "talk", userId, source: "ai_push", scheduleLabel, reason: "missing_sender_profile" },
          expo_ticket: null,
          status: "no_profile",
          error: profErr ? JSON.stringify(profErr) : "missing sender_profile",
          created_at: new Date().toISOString(),
        });

        await bumpLastSent();
        results.push({ userId, scheduleId, scheduleLabel, status: "no_profile" });
        continue;
      }

      // 4) тестовый текст (потом заменим на AI)
      const fromName = profileRow.name || "Someone";
      const toName = profileRow.user_name || "you";
      const body = `Hi ${toName}. This is a message from ${fromName}.`;

      const dataPayload = { screen: "talk", userId, scheduleLabel, source: "ai_push" };
      const pushPayload = { to: expoPushToken, title: "HOLDYOU", body, data: dataPayload };

      let pushJson: any = null;
      let ok = false;

      try {
        const pushResp = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pushPayload),
        });

        ok = pushResp.ok;
        pushJson = await pushResp.json().catch(() => null);

        await supabase.from("push_delivery_logs").insert({
          user_id: userId,
          schedule_label: scheduleLabel,
          expo_push_token: expoPushToken,
          title: "HOLDYOU",
          body,
          data: dataPayload,
          expo_ticket: pushJson,
          status: ok ? "sent" : "failed",
          error: ok ? null : JSON.stringify(pushJson),
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        await supabase.from("push_delivery_logs").insert({
          user_id: userId,
          schedule_label: scheduleLabel,
          expo_push_token: expoPushToken,
          title: "HOLDYOU",
          body,
          data: dataPayload,
          expo_ticket: pushJson,
          status: "failed",
          error: String(e),
          created_at: new Date().toISOString(),
        });
      }

      await bumpLastSent();
      results.push({ userId, scheduleId, scheduleLabel, status: ok ? "sent" : "failed", expo: pushJson });
    }

    return json({ ok: true, due: schedules.length, results });
  } catch (e) {
    return json({ error: "unexpected", details: String(e) }, 500);
  }
});
