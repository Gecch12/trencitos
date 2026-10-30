# FERROVÍA EUROPA — v0.6.1 (private beta)

A non-commercial, original-illustration railway connection game inspired by the rules of *Ticket to Ride: Europe*. This is an independent fan-made prototype; it is not affiliated with or endorsed by Days of Wonder/Asmodee. **No commercial board, card images, logos, or other official graphical assets are included.**

## Run locally

Requirements: **Node.js 20 or newer**, no npm dependencies or external service required.

```bash
npm start
```

Open `http://localhost:3000`. Create a room and copy its invite URL. Other devices on the same Wi-Fi may use `http://YOUR-LAN-IP:3000` (the Windows/macOS firewall may ask you to allow inbound connections). Hosted HTTPS uses secure `wss://` automatically.

Run validation:

```bash
npm test
```

## Publish free to Render

1. Create a **private GitHub repository**, upload the contents of this ZIP, including `render.yaml`, `assets`, `index.html`, `server.js`.
2. Go to https://dashboard.render.com → **New → Blueprint**; connect the repository and accept the free web service. Alternatively create a Web Service (`npm start`, Node runtime, free tier).
3. Wait for deployment, visit the `https://...onrender.com` URL, create a room and share its link.
4. A room can host **2–5 people**, each in a separate browser/device.

**Important:** Render Free uses an ephemeral filesystem. State is checkpointed to a local JSON file to survive *in-process* recovery, but **game rooms can disappear after a Render instance restart or redeploy**. Free services may sleep when inactive, and network interruptions can occur. Treat this as a beta and finish a game in one session. Use persistent external storage before expecting long-running games to survive restarts.

## Architecture

```
index.html, style.css, app.js        browser UI, SVG renderer, reconnect and private hand
assets/cards/*.svg                  10 custom vector railway cards, locomotive, card back
assets/ticket.svg, favicon.svg      original ticket motif and product icon
data.js                             47 cities, 101 European routes, 46 destination tickets
engine.js                           server-only, authoritative rules and scoring
server.js                           HTTP static assets, WebSocket upgrade/frames,
                                    private rooms, reconnect tokens, state filtering
render.yaml                         free Render Blueprint setup
tests/*.test.js                     engine, integration, deployment and simulations
```

No remote SDKs or frontend dependencies. Every gameplay action is validated server-side. The browser receives only its own hand, its own ticket selection, public player counts/points and public routes. A random seat token is kept in localStorage to rejoin an in-progress room on that browser. A new visitor cannot join once the game has started.

## Rules covered

- 2–5 players, 45 trains and three stations each, 110 train cards, 46 tickets (six long).
- Initial deal: four train cards, three regular destinations and one long destination; keep at least two.
- Two train-card draws (a face-up locomotive ends the action), destination draws (keep at least one), claim route or build station.
- Colored and gray routes, tunnel reveal and optional surcharge, ferry locomotive costs, double-route restrictions for 2–3 versus 4–5 players.
- Destination completion with stations limited to one opponent route per station, final station bonus, European Express longest path (including tied paths), final round and tie-breakers.
- No spectators, bots, chat or account system yet.

## Known beta limitations

- 47-city diagram is a **stylized European map**, not the official copyrighted board. The central-European routes are dense; use the zoom and enlarged-board controls.
- Runs as a **single Node.js instance**; multiple horizontally scaled servers would need a shared room store and message transport.
- Rooms have a 24-hour inactivity TTL and no permanent cloud state. An active in-progress game may still be lost on an instance restart.
- Browser end-to-end QA on real devices is not complete; see `QC.md` before inviting five players.
- For an unattended public deployment, a production WebSocket library such as `ws`, a database, load testing, and security review are recommended. The beta includes a small dependency-free WebSocket transport with masked-frame, same-origin and message-size checks.

## Original vector art

The entire `assets` directory contains SVG illustrations authored specifically for this project. `make_assets.py` can regenerate the card collection and ticket motifs; no third-party images need to be downloaded. The UI and card theme are purposefully distinct from official art.


## Route fidelity

This build adds explicit integrity checks for official Europe routes, including Essen–København (double gray ferry, 3 with 1 locomotive each), København–Stockholm (3 yellow / 3 white), London–Dieppe (double gray ferry), Palermo–Smyrna (6 gray with 2 locomotive ferry requirement), and several tunnel/double-route pairs.
