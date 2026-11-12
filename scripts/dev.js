// Local stand-in for Vercel: serves the files, the /l and /s/<id> routes, and the short-link API.
// Without a Redis database in the environment (REDIS_URL, KV_REST_API_URL…), letters are kept in
// memory until you stop it.
//   npm run dev            (http://localhost:8080)
//   PORT=3000 npm run dev
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
process.chdir(root);
// re-read on every request so edits to letter.html show up without a restart
const page = (req, res) => { delete require.cache[require.resolve("../api/l.js")]; return require("../api/l.js")(req, res); };
const letters = require("../api/letters.js");

// a Redis found in the environment (as on Vercel) is used for real; otherwise letters live in memory
const found = letters.detect(process.env);
const api = process.env.NO_STORE ? letters.createHandler({ store: null })
  : found.store ? letters
  : letters.createHandler({ store: require("./memory-store.js")() });
const storeName = process.env.NO_STORE ? "off" : found.store ? found.store.kind : "in memory";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".mp3": "audio/mpeg", ".svg": "image/svg+xml" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname);
  if (p === "/api/letters") return api(req, res);
  if (p === "/l" || /^\/s\/[^/]+\/?$/.test(p)) return page(req, res);
  let file = path.join(root, p === "/" ? "index.html" : p);
  if (!file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
  if (!path.extname(file) && fs.existsSync(file + ".html")) file += ".html"; // cleanUrls
  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader("Content-Type", TYPES[".html"]);
      return fs.readFile(path.join(root, "404.html"), (e, nf) => res.end(e ? "Not found" : nf));
    }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(data);
  });
}).listen(process.env.PORT || 8080, () => console.log(`Tenderly on http://localhost:${process.env.PORT || 8080}  (short links: ${storeName})`));
