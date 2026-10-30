# Quality check — Ferrovía Europa v0.6.1

## Automated QA (executed)

**29/29 passing** with `npm test` on Node.js 22.16.0, October 30, 2026.

- Europe data cardinality: 47 cities, 101 routes, 40 regular tickets, six long tickets.
- Setup, initial ticket selection, deck composition and card conservation.
- Client view privacy; public state does not expose opponent hands, destination tickets or deck order.
- Turn enforcement, invalid moves, double routes by party size.
- Draw rules (visible/hidden locomotive), train payments, ferry/wild logic.
- Tunnel reveal, surcharge and decline; stations and destination scoring.
- Longest path, final turn, winner tiebreaks.
- WebSocket creation, joining, five-player room limit, player reconnection, started-room admission block.
- Full simulated games with 2, 3, 4 and 5 players.
- Serving original SVG assets, unknown-file 404 handling and no external JavaScript in frontend.

**Issues found and fixed this iteration:**
- Static asset filename accepted but nonexistent caused an unhandled streaming error. Explicit 404 added.
- WebSocket now rejects fragmented/RSV frames rather than parsing them as independent JSON, and rejects foreign Origin hosts.
- Heartbeat added to detect disconnected clients and preserve their rejoin slot.

## Manual checks still required before recommending to friends

1. Create a room on an HTTPS deployment, connect simultaneously from Chrome desktop, Safari iOS, and Android Chrome.
2. Verify all five players receive different hidden hands and initial tickets, and no hand is visible to another player.
3. Play a match with tunnels (accept/decline), a ferry, a station and a double route; compare scored outcome to a physical game.
4. Refresh one client mid-turn and verify the reconnection token restores its seat and hand.
5. Try weak Wi-Fi, tab suspension and service restart. A restart can currently erase the room on free hosting.
6. Review map readability at 390px mobile and 1440px desktop, including congested central Europe. Test zoom, tap targets and panel navigation.

**Browser automation was attempted but the restricted execution environment blocked local-page navigation** (`ERR_BLOCKED_BY_ADMINISTRATOR`). Therefore, no browser end-to-end success claim is made. The supplied `tests/browser_smoke.py` is optional for users with Playwright installed; it was not passed in this environment.

## Deployment recommendation

**Status:** private beta for controlled testing; **not** stable production. Working server, rules and SVG assets. Do not rely on Render free local disk for game persistence.


## Added in v0.6.1

- Official-route integrity test coverage for key ferries, tunnels and double-route colors.
- UI wording now spells out ferry requirements as e.g. "4 cartas de un mismo color + 2 locomotoras" instead of only showing the ferry icon count.
- Board preview refreshed so tunnel/ferry markers are easier to spot.
