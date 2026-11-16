# Gangsal

A Big Five personality test in Indonesian. You answer 50 short statements and get a score on each of the five dimensions, plus an animated character whose shape and movement are built from your scores. Every result has its own link that you can share.

*Gangsal* means "five" in Javanese.

## What it does

- **50 statements, one per screen.** Large text, five fully labelled answer buttons, keyboard shortcuts 1 to 5, and automatic advance. Progress is saved in the browser, so the test can be finished later.
- **Five scores from 0 to 100.** Extraversion, Agreeableness, Conscientiousness, Emotional Stability and Imagination, each labelled low (0-34), medium (35-65) or high (66-100), with a short explanation per level.
- **An animated character.** Drawn as SVG and generated from the five scores (see the table below). It also gets a name from the two strongest traits, such as "Si Perancang yang Kalem".
- **Shareable results.** `/h/<code>` opens the result page for anyone. Link previews on WhatsApp, X and other platforms show a 1200x630 image of the character and the scores.
- **Anonymous recap.** The server stores the raw answers without names or emails and shows averages and the spread of levels across all participants.
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

## The test items

The statements are the **IPIP Big-Five Factor Markers, 50-item version** (Goldberg, 1992), published at [ipip.ori.org](https://ipip.ori.org) and placed in the public domain. The Indonesian translation was written for this project and has **not been validated psychometrically**. The server stores raw answers so that reliability (for example Cronbach's alpha per dimension) can be checked once enough people have taken the test.

Scores are calculated from the person's own answers: 0 means always choosing the low end, 100 always the high end. They are not percentiles, because there are no Indonesian norms yet.

## Disclaimer

Results are for self-reflection. Do not use them for psychological diagnosis or for hiring decisions.

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

The code is released under the [MIT License](LICENSE). The test items are the IPIP Big-Five Factor Markers, which are in the public domain and are not covered by this license.
