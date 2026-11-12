# Tenderly

*Letters that bloom.* Write someone a letter; it opens for them inside a bouquet.

They get a link. It opens on their name, in a quiet sunlit room. One tap starts the music and a
bouquet grows, wrapped in paper and tied with a ribbon bow, the way flowers are handed to
someone. A wax-sealed envelope rests on the table beside it. Tapped, it lifts, the seal breaks,
and the letter slides out and unfolds into the page: your words written out line by line, with
your photos and your voice. They can keep the bouquet as a picture (PNG or JPEG) or as a GIF of it blooming, and save the
letter itself as a picture. It is one-way: the page they open has nothing for writing back.

Tenderly combines two earlier projects:

| From **Lindbloom** (the letter) | From **Rebloom** (the moment) |
| --- | --- |
| Long letters, paper styles, photos with captions, a voice note | A bouquet that grows and sways, with music |
| The letter lives in the link, not on a server | The opening screen: their name and "tap to open" |
| Envelope and wax seal, save the letter as an image | Link previews in chat apps, heart-shaped QR codes |
| | A live preview of the real page while you write |
| | Automatic step-down on slow phones, a no-WebGL fallback |

New here: its own look (a daylit room and a paper-wrapped bouquet instead of Rebloom's night
sky; the wrap takes the colour of the letter paper you choose);
**peonies** and a new **painted lily**, both painted from scratch, arranged alone or together;
a painted look as well as an embroidered one, stitched from tiny characters; encrypted short
links; drafts that save themselves; and a keepsake file.

## Privacy

- **The link preview names no one.** Chat apps show only "A letter is waiting for you".
- **Long links** carry the whole letter after the `#`. Browsers never send that part to a server.
- **Short links** (`/s/Ab3k9xQz2m#k=…`): the browser encrypts the letter with a random key before
  uploading it. The server stores ciphertext it cannot read; the key exists only in the link.
- No analytics, no cookies. The only thing kept in the browser is the sender's own draft.

## Deploy on Vercel

1. Import this repository in Vercel. There is no build step and no framework to choose.
2. For short links (and QR codes for letters with photos or a voice note), connect a Redis
   database: in the project, **Storage → Upstash for Redis** (or any Redis from the
   Marketplace) **→ Connect**. Any variable prefix works.
3. **Redeploy** (Deployments → ⋯ → Redeploy). A newly connected database only reaches
   deployments made after it.

Without a database everything still works; links are simply long, because they hold the letter,
and a letter with photos or a voice note is then too big for a QR code.

### Short links or QR codes not working?

Open `https://<your-site>/api/letters` in a browser. It says what the site sees:

| It says | What to do |
| --- | --- |
| `"ok": true` | Short links work. Seal a new letter (old ones keep their long links). |
| `"reason": "no_storage"` | No Redis database reaches this deployment. Connect one (step 2), then redeploy (step 3). |
| `"reason": "unsupported", "other": "Postgres"` | The connected database isn't Redis. Add Upstash for Redis as well. |
| `"reason": "auth"` or `"readonly"` | The database refused the site's password or token. Reconnect it in Storage, then redeploy. |
| `"reason": "unreachable"` | The site can't reach the database. Check it is running in Storage. |

When a letter can't get a short link, the composer also says why, right under the link.

Large letters are stored in pieces of about 0.7 MB, so they fit within any Redis plan's request
limit. A letter can hold up to about 3 MB (four photos and a one-minute voice note fit easily).

## Run it locally

```bash
npm run dev
```

Opens on http://localhost:8080 with the same routes as Vercel. Short links are kept in memory
until you stop it, or in a real Redis if `REDIS_URL` (or Upstash's `KV_REST_API_URL` and
`KV_REST_API_TOKEN`) is set. `NO_STORE=1 npm run dev` shows how the site behaves without storage.

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
| `js/scene.js` | Draws the room and the wrapped bouquet, painted or embroidered |
| `js/world-mixed.js`, `js/world-peonies.js` | The painted bouquets: lilies with peony accents, and peonies alone |
| `js/world-lilies.js` | Rebloom's original 3D lily bouquet |
| `js/bouquet.js` | Builds a painted bouquet from a list of flowers, buds and leaves |
| `js/gif.js` | A small animated-GIF encoder, for saving the bouquet blooming |
| `js/peony.js`, `js/lily.js` | The flower painters (the peony also makes the sprig on the paper) |
| `js/kit.js` | Shared maths, wind, stems, leaves, and the paper wrap and bow |
| `api/l.js` | Serves the letter page with link-preview tags |
| `api/letters.js` | Stores and returns encrypted short-link letters |
| `scripts/dev.js` | Local server that stands in for Vercel |

Routes: `/` composer · `/l#…` long link · `/s/<id>#k=…` short link · `/api/letters` storage.

## Credits

- The 3D lily bouquet ("Classic lilies"), the idea of drawing flowers in text characters and the
  heart QR code come from Rebloom. The music (`audio/bloom.mp3`) is also Rebloom's track; if you publish this for
  others to use, make sure you have the right to use that recording, or replace the file.
- QR codes use [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by
  Kazuhiko Arase (MIT).
- Fonts: Cormorant Garamond and Karla (Rebloom's pairing) and Caveat, from Google Fonts.
