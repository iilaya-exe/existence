// Serves the letter page with link-preview tags, so a chat app shows a proper card.
// Private by default: the preview says only "A letter is waiting for you". The names appear
// in the preview only when the sender chose to put them in the link (?t=…&f=…).
// The letter itself is never here: it lives after the "#", which browsers do not send.
const fs = require("fs");
const path = require("path");

const template = fs.readFileSync(path.join(process.cwd(), "letter.html"), "utf8");

const clean = (v, n) =>
  String(v || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const esc = (v) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

module.exports = (req, res) => {
  const url = new URL(req.url, "https://placeholder.local");
  const to = clean(url.searchParams.get("t"), 40);
  const from = clean(url.searchParams.get("f"), 40);
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const origin = host ? `https://${host}` : "";

  const pageTitle = to ? `For ${to}` : "A letter for you";
  const shareTitle = to ? `A letter for ${to} \u{1F48C}` : "A letter is waiting for you \u{1F48C}";
  const shareDesc = from ? `From ${from}. Tap to open.` : "Someone wrote you something from the heart. Tap to open.";

  const meta = [
    `<title>${esc(pageTitle)}</title>`,
    `<meta name="description" content="${esc(shareDesc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Tenderly">`,
    `<meta property="og:title" content="${esc(shareTitle)}">`,
    `<meta property="og:description" content="${esc(shareDesc)}">`,
    origin ? `<meta property="og:image" content="${origin}/img/og.jpg">` : "",
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join("\n");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(template.replace("<!--META-->", () => meta).replace("<!--GATE_NAME-->", () => esc(to || "for you")));
};
