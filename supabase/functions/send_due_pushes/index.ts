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

/**
 * Build system prompt for PUSH generation (English).
 * Requirements:
 * - 1–2 sentences max
 * - warm, emotionally supportive
 * - NO medical/psychiatric/legal advice, no meds, no diagnosis
 * - if self-harm mentioned: gentle encourage real-life help, no detailed instructions
 * - speak in first person as Sender name (NOT HoldYou)
 */
function buildPushSystemPrompt(params: {
  senderName?: string;
  recipientName?: string;
  tone?: string;
  status?: string;
  specialWords?: string;
}) {
  const base =
    "You generate a short push notification message for the HoldYou app. " +
    "Write warm, emotionally validating content. " +
    "Do NOT give medical, psychiatric, or legal advice. " +
    "Avoid diagnosis, medications, and detailed emergency instructions. " +
    "If self-harm or severe distress is mentioned, gently encourage contacting local emergency services or trusted people in real life. " +
    "Output MUST be English. " +
    "Output MUST be 1–2 sentences max. Keep it short.";

  const senderName = (params.senderName || "Someone").toString().trim();
  const recipientName = (params.recipientName || "you").toString().trim();
  const tone = (params.tone || "gentle, warm, supportive").toString().trim();
  const status = (params.status || "").toString().trim();
  const specialWords = (params.specialWords || "").toString().trim();

  const namePart =
    `You speak in first person as ${senderName}. Do NOT call yourself HoldYou. ` +
    `You are writing to ${recipientName}. `;

  const statusPart = status ? `Your relationship/status is: ${status}. ` : "";

  const wordsPart = specialWords
    ? `These affectionate nicknames the recipient likes: ${specialWords}. Use at most one nickname only if it feels natural. `
    : "";

  const tonePart = `Your tone should feel like: ${tone}. `;

  const formatPart =
    "Return ONLY the message text, no quotes, no emojis unless extremely subtle (prefer none).";

  return `${base} ${namePart}${statusPart}${wordsPart}${tonePart}${formatPart}`;
}

function clampPushText(text: string) {
  // Make it safe for push banners (they truncate anyway).
  // Keep <= 180 chars and 2 sentences max.
  let t = (text || "").replace(/\s+/g, " ").trim();

  // Hard cut if model goes wild
  if (t.length > 260) t = t.slice(0, 260).trim();

  // Keep at most 2 sentences (rough)
  const parts = t.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length > 2) t = parts.slice(0, 2).join(" ").trim();

  // Final length clamp
  if (t.length > 180) {
    t = t.slice(0, 177).trimEnd() + "...";
  }

  return t;
}

async function generatePushBodyDeepSeek(args: {
  apiKey: string;
  senderName: string;
  recipientName: string;
  tone?: string | null;
  status?: string | null;
  specialWords?: string | null;
}) {
  const systemPrompt = buildPushSystemPrompt({
    senderName: args.senderName,
    recipientName: args.recipientName,
    tone: args.tone ?? undefined,
    status: args.status ?? undefined,
    specialWords: args.specialWords ?? undefined,
  });

  // We don't need user messages history for push now; keep deterministic.
  const messages = [
    { role: "system" as const, content: systemPrompt },
    {
      role: "user" as const,
      content:
        "Generate a single push notification message now. Keep it very short and warm.",
    },
  ];

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages,
      temperature: 0.7,
      max_tokens: 120, // enough for 1–2 short sentences
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek error ${res.status}: ${text}`);
  }

  const completion = await res.json();
  const raw = completion?.choices?.[0]?.message?.content ?? "";
  const cleaned = clampPushText(raw);

  // fallback if empty
  if (!cleaned) {
    return "Just checking in. I’m here with you.";
  }

  return cleaned;
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }

  // ✅ защита от публичного дергания
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const incomingSecret = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET && incomingSecret !== CRON_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  // ✅ env
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json(
      {
        error: "Missing env",
        details:
          "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Edge Functions → Secrets.",
      },
      500,
    );
  }

  if (!DEEPSEEK_API_KEY) {
    return json(
      { error: "Missing env", details: "Set DEEPSEEK_API_KEY in Edge Functions → Secrets." },
      500,
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    // 1) Берём due-расписания из VIEW
    const { data: schedules, error: schErr } = await supabase
      .from("v_due_schedules")
      .select("id, user_id, label");

    if (schErr) return json({ error: "due_select_failed", details: schErr }, 500);

    if (!schedules || schedules.length === 0) {
      return json({ ok: true, due: 0 });
    }

    const results: any[] = [];

    for (const sch of schedules as any[]) {
      const scheduleId = sch.id as string;
      const userId = sch.user_id as string;
      const scheduleLabel = (sch.label ?? "unknown") as string;

      // 2) Токен
      const { data: tokenRow, error: tokErr } = await supabase
        .from("user_push_tokens")
        .select("expo_push_token")
        .eq("user_id", userId)
        .maybeSingle();

      const expoPushToken = tokenRow?.expo_push_token ?? null;

      if (tokErr || !expoPushToken) {
        await supabase.from("push_delivery_logs").insert({
          user_id: userId,
          schedule_label: scheduleLabel,
          expo_push_token: null,
          title: "HoldYou",
          body: "",
          data: { screen: "talk", userId, source: "ai_push", scheduleLabel, reason: "missing_token" },
          expo_ticket: null,
          status: "no_token",
          error: tokErr ? JSON.stringify(tokErr) : "missing expo_push_token",
          created_at: new Date().toISOString(),
        });

        await supabase.from("notification_schedules")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", scheduleId);

        results.push({ userId, scheduleId, scheduleLabel, status: "no_token" });
        continue;
      }

      if (!isLikelyExpoToken(expoPushToken)) {
        await supabase.from("push_delivery_logs").insert({
          user_id: userId,
          schedule_label: scheduleLabel,
          expo_push_token: expoPushToken,
          title: "HoldYou",
          body: "",
          data: { screen: "talk", userId, source: "ai_push", scheduleLabel, reason: "bad_token_format" },
          expo_ticket: null,
          status: "bad_token",
          error: "expo_push_token does not look like Expo token",
          created_at: new Date().toISOString(),
        });

        await supabase.from("notification_schedules")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", scheduleId);

        results.push({ userId, scheduleId, scheduleLabel, status: "bad_token" });
        continue;
      }

      // 3) sender_profile — берём нужные поля
      const { data: profileRow, error: profErr } = await supabase
        .from("sender_profiles")
        .select("name, user_name, tone, status, special_words")
        .eq("user_id", userId)
        .maybeSingle();

      if (profErr || !profileRow) {
        await supabase.from("push_delivery_logs").insert({
          user_id: userId,
          schedule_label: scheduleLabel,
          expo_push_token: expoPushToken,
          title: "HoldYou",
          body: "",
          data: { screen: "talk", userId, source: "ai_push", scheduleLabel, reason: "missing_sender_profile" },
          expo_ticket: null,
          status: "no_profile",
          error: profErr ? JSON.stringify(profErr) : "missing sender_profile",
          created_at: new Date().toISOString(),
        });

        await supabase.from("notification_schedules")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("id", scheduleId);

        results.push({ userId, scheduleId, scheduleLabel, status: "no_profile" });
        continue;
      }

      const fromName = (profileRow.name || "Someone").toString().trim();
      const toName = (profileRow.user_name || "you").toString().trim();

      // ✅ Заголовок: "HoldYou: Jane"
      const title = fromName ? `HoldYou: ${fromName}` : "HoldYou";

      // 4) Генерим текст через DeepSeek
      let body = "";
      let aiError: string | null = null;
      try {
        body = await generatePushBodyDeepSeek({
          apiKey: DEEPSEEK_API_KEY!,
          senderName: fromName,
          recipientName: toName,
          tone: profileRow.tone ?? null,
          status: profileRow.status ?? null,
          specialWords: profileRow.special_words ?? null,
        });
      } catch (e) {
        aiError = String(e);
        // fallback
        body = `Hi ${toName}. Just checking in — I’m here with you.`;
      }

      const dataPayload = {
        screen: "talk",
        userId,
        scheduleLabel,
        source: "ai_push",
      };

      const pushPayload = {
        to: expoPushToken,
        title,
        body,
        data: dataPayload,
      };

      // 5) Шлём в Expo Push API
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
          title,
          body,
          data: dataPayload,
          expo_ticket: pushJson,
          status: ok ? "sent" : "failed",
          error: ok ? aiError : JSON.stringify({ push: pushJson, ai: aiError }),
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        await supabase.from("push_delivery_logs").insert({
          user_id: userId,
          schedule_label: scheduleLabel,
          expo_push_token: expoPushToken,
          title,
          body,
          data: dataPayload,
          expo_ticket: pushJson,
          status: "failed",
          error: JSON.stringify({ push: String(e), ai: aiError }),
          created_at: new Date().toISOString(),
        });
      }

      // ✅ не спамим
      await supabase.from("notification_schedules")
        .update({ last_sent_at: new Date().toISOString() })
        .eq("id", scheduleId);

      results.push({
        userId,
        scheduleId,
        scheduleLabel,
        status: ok ? "sent" : "failed",
        title,
        body,
      });
    }

    return json({ ok: true, due: schedules.length, results });
  } catch (e) {
    return json({ error: "unexpected", details: String(e) }, 500);
  }
});
