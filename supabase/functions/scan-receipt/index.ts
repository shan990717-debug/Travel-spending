// Reads a receipt photo with Claude and returns { title, total, currency, date, category }.
// Deploy: supabase functions deploy scan-receipt
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import Anthropic from "npm:@anthropic-ai/sdk@^1.6.0";
import { createClient } from "npm:@supabase/supabase-js@^2.119.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CATEGORIES = ["food", "transport", "stay", "tickets", "shopping", "other"];

const SCHEMA = {
  type: "object",
  properties: {
    is_receipt: { type: "boolean", description: "false if the image is not a receipt, bill or ticket" },
    title: { type: "string", description: 'Short name of the shop or what was bought, e.g. "Ichiran Ramen"' },
    total: { type: "number", description: "Grand total actually paid, after tax/service charge, as a plain number" },
    currency: { type: "string", description: "ISO 4217 code of the total, e.g. JPY, THB, MYR" },
    date: { type: "string", description: "Date printed on the receipt as YYYY-MM-DD, or empty string if none" },
    category: { type: "string", enum: CATEGORIES },
  },
  required: ["is_receipt", "title", "total", "currency", "date", "category"],
  additionalProperties: false,
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { trip_id?: string; image_base64?: string; media_type?: string; fallback_currency?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const { trip_id, image_base64, fallback_currency = "MYR" } = body;
  const media_type = body.media_type ?? "image/jpeg";
  if (!trip_id || !image_base64) return json({ error: "trip_id and image_base64 are required" }, 400);
  if (!["image/jpeg", "image/png", "image/webp"].includes(media_type)) return json({ error: "unsupported image type" }, 400);
  if (image_base64.length > 7_000_000) return json({ error: "image too large" }, 413);

  // Only members of the trip may spend AI credits on it.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: member, error: memberErr } = await supabase.rpc("is_trip_member", { t: trip_id });
  if (memberErr || member !== true) return json({ error: "not a member of this trip" }, 403);

  try {
    // `fallbacks` lets the API retry on another model if a safety classifier declines.
    const params = {
      model: "claude-opus-5-5",
      max_tokens: 4096,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type, data: image_base64 } },
            {
              type: "text",
              text:
                "This is a photo of a receipt, bill or ticket from a trip. Extract the grand total that was " +
                "actually paid, its currency (ISO code - infer it from symbols, language or country when it is " +
                `not printed; if it is still unclear use ${fallback_currency}), the date, a short title (shop ` +
                "name or main item, in the receipt's own language is fine), and the best matching category.",
            },
          ],
        },
      ],
    };
    // deno-lint-ignore no-explicit-any
    const response = await anthropic.beta.messages.create(params as any);

    if (response.stop_reason === "refusal") return json({ error: "could not read this image" }, 422);
    const text = response.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined;
    if (!text) return json({ error: "no result" }, 502);
    const data = JSON.parse(text.text);
    if (!data.is_receipt) return json({ error: "not a receipt" }, 422);

    return json({
      title: String(data.title || "").slice(0, 120),
      total: Number(data.total) || 0,
      currency: String(data.currency || "").toUpperCase(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : "",
      category: CATEGORIES.includes(data.category) ? data.category : "other",
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "busy, try again shortly" }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "server API key is invalid" }, 500);
    if (err instanceof Anthropic.APIError) return json({ error: `AI error ${err.status}` }, 502);
    console.error(err);
    return json({ error: "scan failed" }, 500);
  }
});
