# Quality check — Ferrovía Europa v0.6.1

> Informe histórico de la ejecución indicada abajo; no describe la validación
> del checkout actual. Para evidencia posterior y pendientes, usa el
> [índice de QA](docs/qa-index.md). La advertencia original sobre pérdida de salas
> precede a la persistencia Supabase; el comportamiento actual está en
> [arquitectura](docs/architecture.md) y [operación](docs/operations.md).

## Automated QA (executed)

**65/65 passing** with `npm test` on Node.js 25.6.1, October 30, 2026, after integrating the local map/practice work with the remote Ferrovía update. HTTP and WebSocket tests ran with local listening permissions enabled.

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
- Shared cartography delivery, 300 uniform track slots, route separation and desktop label placement.
- Bot decisions, delayed actions, pause/reconnect/expiry, early finish and room cleanup.
- Keeping new destinations restores normal play and allows the next player to act.
- Foreign/malformed WebSocket origins and fragmented/reserved-bit frames are rejected.

**Issues found and fixed this iteration:**
- Static asset filename accepted but nonexistent caused an unhandled streaming error. Explicit 404 added.
- WebSocket now rejects fragmented/RSV frames rather than parsing them as independent JSON, and rejects foreign Origin hosts.
- Multiplayer heartbeat detects disconnected clients and preserves their rejoin slot; practice retains its separate disconnect/expiry timing.
- Merge integration retains the shared map and ticket selector while adding Ferrovía assets and the hand dock. Docker now includes the SVG assets.

## Manual checks still required before recommending to friends

1. Create a room on an HTTPS deployment, connect simultaneously from Chrome desktop, Safari iOS, and Android Chrome.
2. Verify all five players receive different hidden hands and initial tickets, and no hand is visible to another player.
3. Play a match with tunnels (accept/decline), a ferry, a station and a double route; compare scored outcome to a physical game.
4. Refresh one client mid-turn and verify the reconnection token restores its seat and hand.
5. Try weak Wi-Fi, tab suspension and service restart. A restart can currently erase the room on free hosting.
6. Review map readability at 390px mobile and 1440px desktop, including congested central Europe. Test zoom, tap targets and panel navigation.

## Desktop browser verification after the merge

Verified against the local server using the in-app browser, October 30, 2026:

- Ferrovía branding, illustrated cards and the shared cartography render together.
- Create a practice room, choose initial tickets, choose a different additional destination, and resume after all three bots act.
- Draw two cards, receive the next human turn, zoom to 125%, fit the map, expand and exit with Escape.
- Reload the page and reconnect to the same practice room with its tickets and scores intact.
- Finish practice early, show scores, and return to the lobby.
- Create a multiplayer room, join from a second browser tab with separate origin storage, choose both players' initial tickets and pass the turn by drawing two cards.
- The invitation button appears for multiplayer and stays hidden in practice. No browser warnings or errors were recorded in either player tab.

The optional Python script `tests/browser_smoke.py` was not run (the Python Playwright package is not installed). Real-device, mobile, public-hosting and load checks above remain pending. The Docker asset-copy change was inspected; a container build was not run.

## Deployment recommendation

**Status:** private beta for controlled testing; **not** stable production. Working server, rules and SVG assets. Do not rely on Render free local disk for game persistence.


## Added in v0.6.1

- Official-route integrity test coverage for key ferries, tunnels and double-route colors.
- UI wording now spells out ferry requirements as e.g. "4 cartas de un mismo color + 2 locomotoras" instead of only showing the ferry icon count.
- Board preview refreshed so tunnel/ferry markers are easier to spot.
