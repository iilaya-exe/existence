// Serves the letter page at /l and /s/<id> with link-preview tags, so a chat app shows a proper
// card. The preview is the same for every letter and names no one: "A letter is waiting for you".
// The letter itself is never here: it lives after the "#", which browsers do not send.
const fs = require("fs");
const path = require("path");

const template = fs.readFileSync(path.join(process.cwd(), "letter.html"), "utf8");

module.exports = (req, res) => {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").replace(/[^A-Za-z0-9.:-]/g, "");
  const origin = host ? `https://${host}` : "";
  const desc = "Someone wrote you something from the heart. Tap to open.";

  const meta = [
    // letter.html finds its scripts and styles beside itself; served from /s/<id> they are at the root
    `<base href="/">`,
    `<title>A letter for you</title>`,
    `<meta name="description" content="${desc}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Tenderly">`,
    `<meta property="og:title" content="A letter is waiting for you \u{1F48C}">`,
    `<meta property="og:description" content="${desc}">`,
    origin ? `<meta property="og:image" content="${origin}/img/og.jpg">` : "",
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].filter(Boolean).join("\n");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(template.replace("<!--META-->", () => meta));
};
