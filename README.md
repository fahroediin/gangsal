# Gangsal

A Big Five personality test in Indonesian. You answer 50 short statements and get a score on each of the five dimensions, plus an animated character whose shape and movement are built from your scores. Every result has its own link that you can share.

*Gangsal* means "five" in Javanese.

## What it does

- **50 statements, one per screen.** Large text, five fully labelled answer buttons, keyboard shortcuts 1 to 5, and automatic advance. Progress is saved in the browser, so the test can be finished later.
- **Five scores from 0 to 100.** Extraversion, Agreeableness, Conscientiousness, Emotional Stability and Imagination, each labelled low (0-34), medium (35-65) or high (66-100), with a short explanation per level.
- **An animated character.** Drawn as SVG and generated from the five scores (see the table below). It also gets a name from the two strongest traits, such as "Si Perancang yang Kalem".
- **Shareable results.** `/h/<code>` opens the result page for anyone. Link previews on WhatsApp, X and other platforms show a 1200x630 image of the character and the scores.
- **Anonymous recap.** The server stores the raw answers without names or emails and shows averages and the spread of levels across all participants.
- **Invitations for teams and HR.** Create an invitation at `/undang` without an account, share an 8-character code or link, and see every participant's name and scores on a private recap page. See [Invitations](#invitations).
- **Built for readers aged 20 to 50.** Atkinson Hyperlegible for body text, large touch targets, light and dark themes, and layouts tested from 320px phones to 1440px desktops, including phones in landscape.

### How the character is built

| Dimension | What changes |
|---|---|
| Extraversion | Body size, waving arms, bounce speed |
| Agreeableness | Smile, blushing cheeks, a beating heart |
| Conscientiousness | Glasses and bow tie when high, messy hair when low |
| Emotional Stability | Calm eyes when high; worried brows, sweat drop and jitter when low |
| Imagination | Zero to two antennae and twinkling stars |

The body colour follows the most pronounced trait. Animation stops when the viewer has turned on reduced motion.

## Invitations

An organiser (for example an HR team) creates an invitation with an optional title, a time limit (1 hour, 1 day, 7 days or 30 days from creation) and an optional cap on participants. They receive two links:

- **Participant link** `/i/<code>#<title-key>`. Participants can also type the 8-character code on the home page.
- **Recap link** `/r/<code>#<admin-token>.<title-key>.<private-key>`. Only this link can read participant names.

Participants give their name, agree to share it with the organiser, and take the test. Their anonymous scores also count toward the public recap. The recap page shows each name, the five scores, the character, average scores, a CSV download, and a button to delete the invitation.

**Privacy design.** The operator of the server cannot read participant names, invitation titles, or tell who created an invitation:

- The organiser's browser creates an ECDH P-256 key pair. Only the public key is sent to the server.
- Each participant's browser encrypts their name with that public key (ephemeral ECDH, HKDF-SHA-256, AES-GCM). The server stores only ciphertext.
- The title is encrypted with AES-GCM using a key that lives in the link fragment.
- Everything after `#` stays in the browser and is never sent to the server. The server keeps only a SHA-256 hash of the admin token.
- If the recap link is lost, the names cannot be recovered by anyone.

Per-participant data is deleted automatically 90 days after an invitation's deadline. Use results as one input for a conversation, not as the only basis for hiring or appraisal decisions.

## The test items

The statements are the **IPIP Big-Five Factor Markers, 50-item version** (Goldberg, 1992), published at [ipip.ori.org](https://ipip.ori.org) and placed in the public domain. The Indonesian wording is the validated **IPIP-BFM-50 Indonesia** adaptation (Akhtar & Azwar, 2019; alpha .76 to .86, n = 502), used under CC BY-SA 4.0 (see `public/items-id.js`).

How the app follows the published guidance:

- **Scoring** follows the IPIP scoring instructions (1 to 5, reverse keyed items, summed per scale), then converts to POMP, the percent of maximum possible score (Cohen et al., 1999). POMP is not a percentile.
- **Low, medium and high** follow IPIP's advice to use the sample's own mean plus or minus half a standard deviation. The app switches to these norms once 100 people have taken the test; until then the labels use provisional cut-offs of 35 and 65 and say so.
- **Characters are illustrations, not types.** IPIP cautions against sorting people into categories; every result shows the full five scores.
- **OCEAN view**: O uses IPIP's Intellect/Imagination scale (closest to Openness); N is 100 minus Emotional Stability.
- **Use by organisations**: under the Indonesian Psychological Association code of ethics (HIMPSI, 2010, Articles 62 to 65), a psychological examination report with recommendations can only be made by a psychologist. The app tells organisations not to use results as the sole basis for decisions.
- **Personal data** (Indonesian Law 27/2022): consent is recorded with each invitation result (Art. 22), organisers can delete one participant or a whole invitation (Art. 8, 43), and data is deleted 90 days after the deadline.

The full method, the mapping to each rule and the reference list are on the `/metode` page of the app.

## Disclaimer

Results are for self-reflection and conversation, not psychological diagnosis. Do not use them as the only basis for hiring or appraisal decisions; involve a psychologist for selection decisions.

## Tech stack

- [Bun](https://bun.sh) server with `bun:sqlite`, no framework
- Plain HTML, CSS and ES modules in the browser, no build step
- [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) to render the link preview images
- Test items, scoring and the character live in shared modules (`public/core.js`, `public/character.js`) used by both the browser and the server

## Run locally

```bash
bun install
bun server.ts
```

Open http://127.0.0.1:5178. The SQLite database is created at `data/gangsal.sqlite`.

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5178` | Port to listen on |
| `HOST` | `127.0.0.1` | Interface to bind |
| `DB_PATH` | `data/gangsal.sqlite` | SQLite file |
| `TRUST_PROXY` | unset | Set to `1` behind nginx so the real client IP (`X-Real-IP`) is used for rate limiting |

## Tests

```bash
bun test
```

The tests check the item keys against the IPIP source, the scoring, the character, input validation, the share pages, the preview images and the rate limit.

## Routes

| Route | Description |
|---|---|
| `GET /` | The app |
| `GET /h/<E-A-C-S-I>` | Shared result page with Open Graph tags, for example `/h/73-55-40-80-30` |
| `GET /og/<code>.png` | 1200x630 link preview image |
| `GET /c/<code>.svg` | The animated character as a standalone SVG |
| `POST /api/results` | Save answers: `{ "cid": "<uuid>", "answers": [50 integers from 1 to 5] }`. Scores are recalculated on the server. Limited to 20 requests per IP per hour. |
| `GET /api/stats` | Participant count, average scores and level distribution |
| `GET /undang`, `/i/<code>`, `/r/<code>` | Create an invitation, join one, and the organiser's recap |
| `POST /api/invites` | Create an invitation: `{ pub, adminHash, title, duration, maxParticipants }`. Limited to 10 per IP per hour. |
| `GET /api/invites/<code>` | Public invitation info: encrypted title, deadline, whether it is open |
| `POST /api/invites/<code>/results` | Submit answers with an encrypted name. Rejected after the deadline (410), when full or already submitted from the same device (409). |
| `GET /api/invites/<code>/results` | Encrypted names and scores. Requires the `X-Admin-Token` header. |
| `DELETE /api/invites/<code>` | Delete the invitation and its per-participant data. Requires `X-Admin-Token`. |

## Deployment

See [DEPLOY.md](DEPLOY.md) (in Indonesian) for running it with PM2 and nginx. The server needs Liberation Sans (or Arial) installed so the text in preview images renders.

## Project layout

```
server.ts          HTTP server, API, share pages
og.ts              Link preview image (SVG to PNG)
server.test.ts     Tests
public/
  index.html       Page shell
  app.js           Views, test flow, sharing, theme
  core.js          Items, keys, scoring, persona names, texts
  character.js     Character generator
  styles.css       Styles
  theme.js         Applies the saved theme before first paint
```

## License

The code is released under the [MIT License](LICENSE), except `public/items-id.js`.

- `public/items-id.js` contains the Indonesian item wording from Akhtar & Azwar (2019), *Jurnal Psikologi* 46(1), 32-44, https://doi.org/10.22146/jpsi.33571, and is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), following the source article. Changes to that file must keep the same license.
- The original English items are the IPIP Big-Five Factor Markers (Goldberg, 1992), in the public domain.
