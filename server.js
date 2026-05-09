// ============================================================
//  GOLD PRO — LINE Alert Bot
//  TradingView Webhook → LINE Messaging API
//  Runtime: Node.js 18+  (ไม่ต้องติดตั้ง package เพิ่ม)
//  รัน: node server.js
// ============================================================

const http   = require("http");
const https  = require("https");
const url    = require("url");

// ── CONFIG ────────────────────────────────────────────────────
const CONFIG = {
  PORT                : process.env.PORT                 || 3000,
  SECRET_TOKEN        : process.env.SECRET_TOKEN         || "GOLD_SECRET",
  LINE_CHANNEL_TOKEN  : process.env.LINE_CHANNEL_TOKEN   || "",
  LINE_USER_ID        : process.env.LINE_USER_ID         || "",
};

// ── EMOJI MAP ─────────────────────────────────────────────────
function getEmoji(alert) {
  const a = alert.toLowerCase();
  if (a.includes("buy"))                              return "🟢";
  if (a.includes("sell"))                             return "🔴";
  if (a.includes("golden cross"))                     return "✨";
  if (a.includes("death cross"))                      return "💀";
  if (a.includes("overbought"))                       return "🔥";
  if (a.includes("oversold"))                         return "🧊";
  if (a.includes("dxy") && a.includes("down"))        return "💵📉";
  if (a.includes("dxy") && a.includes("up"))          return "💵📈";
  if (a.includes("higher high"))                      return "📈";
  if (a.includes("lower low"))                        return "📉";
  if (a.includes("bull engulf"))                      return "🕯️🟢";
  if (a.includes("bear engulf"))                      return "🕯️🔴";
  if (a.includes("full bullish"))                     return "🚀";
  if (a.includes("full bearish"))                     return "⬇️";
  return "⚡";
}

// ── FORMAT MESSAGE ─────────────────────────────────────────────
function formatMessage(data) {
  const now   = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  const alert = (data.alert || data.message || "Alert").trim();
  const emoji = getEmoji(alert);

  let lines = [];
  lines.push(`${emoji} GOLD PRO ALERT`);
  lines.push("━━━━━━━━━━━━━━━━");
  lines.push(`📌 ${alert}`);
  if (data.price)   lines.push(`💰 ราคา: ${data.price}`);
  if (data.rsi)     lines.push(`📊 RSI: ${data.rsi}`);
  if (data.macd)    lines.push(`📉 MACD: ${data.macd}`);
  if (data.mtf)     lines.push(`🔭 MTF: ${data.mtf}`);
  if (data.zone)    lines.push(`📐 Zone: ${data.zone}`);
  if (data.session) lines.push(`🕐 Session: ${data.session}`);
  if (data.adx)     lines.push(`💪 ADX: ${data.adx}`);
  if (data.score)   lines.push(`⭐ Score: ${data.score}`);
  if (data.note)    lines.push(`📝 ${data.note}`);
  lines.push("━━━━━━━━━━━━━━━━");
  lines.push(`🗓️ ${now}`);

  return lines.join("\n");
}

// ── SEND LINE MESSAGING API ────────────────────────────────────
function sendLine(text) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.LINE_CHANNEL_TOKEN || !CONFIG.LINE_USER_ID) {
      console.warn("[WARN] ยังไม่ได้ตั้ง LINE_CHANNEL_TOKEN หรือ LINE_USER_ID");
      return resolve({ status: 0 });
    }

    const payload = JSON.stringify({
      to: CONFIG.LINE_USER_ID,
      messages: [{ type: "text", text }],
    });

    const req = https.request(
      {
        hostname: "api.line.me",
        path    : "/v2/bot/message/push",
        method  : "POST",
        headers : {
          "Content-Type"  : "application/json",
          "Authorization" : `Bearer ${CONFIG.LINE_CHANNEL_TOKEN}`,
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          console.log(`[LINE] ${res.statusCode} — ${body}`);
          resolve({ status: res.statusCode, body });
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── HTTP SERVER ────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // Health check
  if (req.method === "GET" && parsed.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("GOLD PRO LINE Bot — ✅ พร้อมใช้งาน");
    return;
  }

  // Webhook
  if (req.method === "POST" && parsed.pathname === "/webhook") {
    // ตรวจ token
    if (parsed.query.token !== CONFIG.SECRET_TOKEN) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Unauthorized" }));
      console.warn("[WARN] Token ไม่ถูกต้อง");
      return;
    }

    let rawBody = "";
    req.on("data", (c) => (rawBody += c));
    req.on("end", async () => {
      try {
        // รองรับทั้ง JSON และ plain text
        let data = {};
        try {
          data = JSON.parse(rawBody);
        } catch {
          data = { alert: rawBody.trim() };
        }

        console.log("[WEBHOOK]", JSON.stringify(data));
        const text   = formatMessage(data);
        const result = await sendLine(text);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, line_status: result.status }));
      } catch (err) {
        console.error("[ERROR]", err.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(CONFIG.PORT, () => {
  console.log(`\n✅  GOLD PRO LINE Bot พร้อมใช้งาน`);
  console.log(`    PORT        : ${CONFIG.PORT}`);
  console.log(`    Webhook URL : http://YOUR_DOMAIN:${CONFIG.PORT}/webhook?token=${CONFIG.SECRET_TOKEN}\n`);
});
