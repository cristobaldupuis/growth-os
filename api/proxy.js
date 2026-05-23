// api/proxy.js — Anthropic API proxy
// Sits between Growth OS and Anthropic so the API key never touches the browser.
// Protection: shared secret header + per-IP rate limiting.

const ALLOWED_ORIGIN = "https://growth-os.vercel.app";
const ANTHROPIC_API  = "https://api.anthropic.com/v1/messages";

// Rate limit: max requests per window per IP
const RATE_LIMIT_MAX    = 50;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

// In-memory store (resets on cold start, good enough for abuse prevention)
const ipLog = new Map();

function isRateLimited(ip) {
  const now  = Date.now();
  const entry = ipLog.get(ip) || { count: 0, windowStart: now };

  // Reset window if expired
  if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
    entry.count       = 0;
    entry.windowStart = now;
  }

  entry.count += 1;
  ipLog.set(ip, entry);

  return entry.count > RATE_LIMIT_MAX;
}

export default async function handler(req, res) {
  // CORS — only allow requests from the deployed app
  res.setHeader("Access-Control-Allow-Origin",  ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-gos-secret");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- Shared secret check ---
  const secret = req.headers["x-gos-secret"];
  if (!secret || secret !== process.env.GOS_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // --- Rate limit check ---
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Rate limit exceeded. Try again later." });
  }

  // --- Forward to Anthropic ---
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const upstream = await fetch(ANTHROPIC_API, {
      method:  "POST",
      headers: {
        "Content-Type":       "application/json",
        "x-api-key":          apiKey,
        "anthropic-version":  "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
