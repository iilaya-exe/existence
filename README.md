# Tenderly

*Letters that bloom.* Write someone a letter; it opens for them inside a bouquet.

They get a link. It opens on their name under falling stars. One tap starts the music and a
bouquet grows out of the dark. An envelope with your initial on its wax seal waits beneath the
flowers, and inside it is your letter on paper, written out line by line, with your photos and
your voice.

Tenderly combines two earlier projects:

| From **Lindbloom** (the letter) | From **Rebloom** (the moment) |
| --- | --- |
| Long letters, paper styles, photos with captions, a voice note | The bouquet that grows and sways on a night sky, with music |
| The letter lives in the link, not on a server | The opening screen: their name, falling stars, "tap to open" |
| Envelope and wax seal, save the letter as an image | Link previews in chat apps, heart-shaped QR codes |
| | A live preview of the real page while you write |
| | Automatic step-down on slow phones, a no-WebGL fallback |

New here: **peonies** and a new **painted lily** (both painted from scratch, replacing
Lindbloom's flowers), arranged alone or together in one bouquet; a painted look as well as
Rebloom's embroidered text-character look; encrypted short links, drafts that save
themselves, a "Write back" button, and a keepsake file.

## Privacy

- **The link preview names no one.** Chat apps show only "A letter is waiting for you".
- **Long links** carry the whole letter after the `#`. Browsers never send that part to a server.
- **Short links** (`/s/Ab3k9xQz2m#k=…`): the browser encrypts the letter with a random key before
  uploading it. The server stores ciphertext it cannot read; the key exists only in the link.
- No analytics, no cookies. The only thing kept in the browser is the sender's own draft.

## Deploy on Vercel

1. Import this repository in Vercel. There is no build step and no framework to choose.
2. For short links and QR codes of long letters, add storage: in the project, **Storage →
   Upstash for Redis → Create**, and connect it to the project. Vercel adds the
   `KV_REST_API_URL` and `KV_REST_API_TOKEN` variables by itself. Redeploy.

Without step 2 everything still works; links are simply long, because they hold the letter.
A stored letter is at most about 3 MB (four photos and a one-minute voice note fit easily).

## Run it locally

```bash
npm run dev
```

Opens on http://localhost:8080 with the same routes as Vercel. Short links are kept in memory
until you stop it. `NO_STORE=1 npm run dev` shows how the site behaves without storage.

You can also just open `index.html` from the folder. Writing, the live preview and sending all
work that way; links are long ones that point at the `letter.html` beside it, and the keepsake
file can't be made (browsers don't let a page read its neighbouring files from a folder).

```bash
npm test
```

## How it is put together

No framework, no bundler, no dependencies to install.

| File | What it does |
| --- | --- |
| `index.html`, `js/compose.js`, `css/compose.css` | The composer: form, live preview, drafts, sending |
| `letter.html`, `js/letter.js`, `css/letter.css` | What the recipient sees |
| `js/codec.js` | Packing, compressing and encrypting a letter into a link (shared with the tests) |
| `js/scene.js` | Draws a bouquet on the night sky, embroidered or painted |
| `js/world-mixed.js`, `js/world-peonies.js` | The painted bouquets: lilies with peony accents, and peonies alone |
| `js/world-lilies.js` | Rebloom's original 3D lily bouquet |
| `js/bouquet.js` | Builds a painted bouquet from a list of flowers, buds and leaves |
| `js/peony.js`, `js/lily.js` | The flower painters (the peony also makes the sprig on the paper) |
| `js/kit.js` | Shared maths, wind, stems and leaves |
| `api/l.js` | Serves the letter page with link-preview tags |
| `api/letters.js` | Stores and returns encrypted short-link letters |
| `scripts/dev.js` | Local server that stands in for Vercel |

Routes: `/` composer · `/l#…` long link · `/s/<id>#k=…` short link · `/api/letters` storage.

## Credits

- The lily bouquet, the text-character renderer, the falling stars and the heart QR code come
  from Rebloom. The music (`audio/bloom.mp3`) is also Rebloom's track; if you publish this for
  others to use, make sure you have the right to use that recording, or replace the file.
- QR codes use [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by
  Kazuhiko Arase (MIT).
- Fonts: Cormorant Garamond and Karla (Rebloom's pairing) and Caveat, from Google Fonts.
