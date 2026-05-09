// ============================================================
//  GOLD PRO v3 — LINE AI Chatbot + Alert Bot
//  TradingView Webhook  → LINE Messaging API (Push)
//  LINE Chat ผู้ใช้พิมพ์ → Claude AI → ตอบกลับ (Reply)
//  Runtime : Node.js 18+   ไม่ต้องติดตั้ง package เพิ่ม
//  รัน     : node server.js
// ============================================================

const http   = require("http");
const https  = require("https");
const url    = require("url");
const crypto = require("crypto");

// ── CONFIG ─────────────────────────────────────────────────────
const CONFIG = {
  PORT                : process.env.PORT                 || 3000,
  SECRET_TOKEN        : process.env.SECRET_TOKEN         || "GOLD_SECRET",
  LINE_CHANNEL_TOKEN  : process.env.LINE_CHANNEL_TOKEN   || "",
  LINE_USER_ID        : process.env.LINE_USER_ID         || "",
  LINE_CHANNEL_SECRET : process.env.LINE_CHANNEL_SECRET  || "",
  ANTHROPIC_API_KEY   : process.env.ANTHROPIC_API_KEY    || "",
};

// ── AI SYSTEM PROMPT ───────────────────────────────────────────
const SYSTEM_PROMPT = `คุณคือ "GOLD PRO AI" ผู้เชี่ยวชาญด้านการเทรดทองคำ (XAUUSD) และตลาด Forex
ตอบคำถามเกี่ยวกับ:
- การวิเคราะห์ทางเทคนิค: RSI, MACD, EMA, Bollinger Bands, ADX, Ichimoku
- Price Action, แนวรับ/แนวต้าน, Chart Pattern
- Multi-Timeframe Analysis (MTF)
- การบริหารความเสี่ยง (Risk Management, Position Sizing, R:R)
- ความสัมพันธ์ Gold กับ DXY, Bond Yield, ภาวะเศรษฐกิจ
- การอ่าน TradingView Signal และ Indicator

กฎ:
- ตอบภาษาไทยเป็นหลัก กระชับ ชัดเจน
- ใช้ emoji ประกอบให้อ่านง่าย
- ไม่แนะนำ Buy/Sell โดยตรง — เป็นข้อมูลประกอบการตัดสินใจเท่านั้น
- ถ้าไม่รู้จริงๆ บอกตรงๆ ว่าไม่แน่ใจ`;

// ── EMOJI MAP ──────────────────────────────────────────────────
function getEmoji(alert) {
  const a = alert.toLowerCase();
  if (a.includes("buy"))                         return "🟢";
  if (a.includes("sell"))                        return "🔴";
  if (a.includes("golden cross"))                return "✨";
  if (a.includes("death cross"))                 return "💀";
  if (a.includes("overbought"))                  return "🔥";
  if (a.includes("oversold"))                    return "🧊";
  if (a.includes("dxy") && a.includes("down"))   return "💵📉";
  if (a.includes("dxy") && a.includes("up"))     return "💵📈";
  if (a.includes("higher high"))                 return "📈";
  if (a.includes("lower low"))                   return "📉";
  if (a.includes("bull engulf"))                 return "🕯️🟢";
  if (a.includes("bear engulf"))                 return "🕯️🔴";
  if (a.includes("full bullish"))                return "🚀";
  if (a.includes("full bearish"))                return "⬇️";
  return "⚡";
}

// ── FORMAT ALERT MESSAGE ───────────────────────────────────────
function formatMessage(data) {
  const now   = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
  const alert = (data.alert || data.message || "Alert").trim();
  const emoji = getEmoji(alert);
  const lines = [];
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

// ── CLAUDE AI ──────────────────────────────────────────────────
function askClaude(userMessage) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.ANTHROPIC_API_KEY) {
      return resolve("⚠️ ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY\nกรุณาติดต่อแอดมิน");
    }
    const payload = JSON.stringify({
      model      : "claude-sonnet-4-20250514",
      max_tokens : 1000,
      system     : SYSTEM_PROMPT,
      messages   : [{ role: "user", content: userMessage }],
    });
    const req = https.request({
      hostname : "api.anthropic.com",
      path     : "/v1/messages",
      method   : "POST",
      headers  : {
        "Content-Type"      : "application/json",
        "x-api-key"         : CONFIG.ANTHROPIC_API_KEY,
        "anthropic-version" : "2023-06-01",
        "Content-Length"    : Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (json.content && json.content[0] && json.content[0].text) {
            return resolve(json.content[0].text);
          }
          console.error("[Claude] unexpected:", body);
          resolve("❌ Claude ตอบไม่ได้ในขณะนี้ กรุณาลองใหม่");
        } catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── LINE PUSH (TradingView Alert → ผู้ใช้) ────────────────────
function linePush(to, text) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.LINE_CHANNEL_TOKEN || !CONFIG.LINE_USER_ID) {
      console.warn("[WARN] ยังไม่ได้ตั้ง LINE_CHANNEL_TOKEN หรือ LINE_USER_ID");
      return resolve({ status: 0 });
    }
    const payload = JSON.stringify({ to, messages: [{ type: "text", text }] });
    const req = https.request({
      hostname : "api.line.me",
      path     : "/v2/bot/message/push",
      method   : "POST",
      headers  : {
        "Content-Type"   : "application/json",
        "Authorization"  : `Bearer ${CONFIG.LINE_CHANNEL_TOKEN}`,
        "Content-Length" : Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        console.log(`[Push] ${res.statusCode} ${body}`);
        resolve({ status: res.statusCode });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── LINE REPLY (Bot ตอบกลับผู้ใช้) ───────────────────────────
function lineReply(replyToken, text) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.LINE_CHANNEL_TOKEN) return resolve({ status: 0 });
    const payload = JSON.stringify({ replyToken, messages: [{ type: "text", text }] });
    const req = https.request({
      hostname : "api.line.me",
      path     : "/v2/bot/message/reply",
      method   : "POST",
      headers  : {
        "Content-Type"   : "application/json",
        "Authorization"  : `Bearer ${CONFIG.LINE_CHANNEL_TOKEN}`,
        "Content-Length" : Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = "";
      res.on("data", c => body += c);
      res.on("end", () => {
        console.log(`[Reply] ${res.statusCode} ${body}`);
        resolve({ status: res.statusCode });
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ── VERIFY LINE SIGNATURE ──────────────────────────────────────
function verifySignature(rawBody, signature) {
  if (!CONFIG.LINE_CHANNEL_SECRET || !signature) return true;
  const hash = crypto.createHmac("sha256", CONFIG.LINE_CHANNEL_SECRET)
    .update(rawBody).digest("base64");
  return hash === signature;
}

// ── PROCESS LINE EVENTS (Chatbot) ─────────────────────────────
async function processLineEvents(events) {
  for (const ev of events) {
    if (ev.type !== "message" || ev.message.type !== "text") continue;
    const text   = ev.message.text.trim();
    const userId = ev.source && ev.source.userId ? ev.source.userId : "unknown";
    console.log(`[Chat] ${userId}: "${text}"`);
    try {
      const reply = await askClaude(text);
      await lineReply(ev.replyToken, reply);
    } catch(err) {
      console.error("[Chat error]", err.message);
      await lineReply(ev.replyToken, "❌ เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    }
  }
}

// ── HTTP SERVER ────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // Health check
  if (req.method === "GET" && parsed.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("GOLD PRO LINE AI Bot v3 — ✅ พร้อมใช้งาน");
    return;
  }

  // LINE Chatbot Webhook
  if (req.method === "POST" && parsed.pathname === "/line") {
    let raw = "";
    req.on("data", c => raw += c);
    req.on("end", async () => {
      if (!verifySignature(raw, req.headers["x-line-signature"])) {
        res.writeHead(401); res.end(JSON.stringify({ error: "Invalid signature" })); return;
      }
      try {
        const body = JSON.parse(raw);
        console.log("[LINE Webhook] events:", body.events ? body.events.length : 0);
        if (body.events && body.events.length) {
          processLineEvents(body.events).catch(console.error);
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch(err) {
        console.error("[LINE Webhook error]", err.message);
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // TradingView Alert Webhook
  if (req.method === "POST" && parsed.pathname === "/webhook") {
    if (parsed.query.token !== CONFIG.SECRET_TOKEN) {
      res.writeHead(401); res.end(JSON.stringify({ error: "Unauthorized" }));
      console.warn("[WARN] Token ไม่ถูกต้อง"); return;
    }
    let raw = "";
    req.on("data", c => raw += c);
    req.on("end", async () => {
      try {
        let data = {};
        try { data = JSON.parse(raw); } catch { data = { alert: raw.trim() }; }
        console.log("[WEBHOOK]", JSON.stringify(data));
        const text   = formatMessage(data);
        const result = await linePush(CONFIG.LINE_USER_ID, text);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, line_status: result.status }));
      } catch(err) {
        console.error("[WEBHOOK error]", err.message);
        res.writeHead(500); res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end("Not Found");
});

server.listen(CONFIG.PORT, () => {
  console.log("");
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   GOLD PRO LINE AI Bot v3  ✅  READY     ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  PORT             : ${String(CONFIG.PORT).padEnd(20)}║`);
  console.log(`║  TradingView URL  : /webhook?token=***   ║`);
  console.log(`║  LINE Webhook URL : /line                ║`);
  console.log("╚══════════════════════════════════════════╝");
  console.log("");
});
