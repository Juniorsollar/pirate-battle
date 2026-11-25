# Architecture

This document explains how Pirate Battle is organised and why. Setup, commands and controls are in the [README](README.md).

## Overview

```
 React (menus, HUD, dialogs)          PixiJS (arena)
 ───────────────────────────          ─────────────────────────────
 App ── screen state machine          GameRenderer  (reads Simulation)
  │                                        ▲
  ├─ MatchScreen ──► GameSession ──────────┤  owns Pixi Application + ticker
  │     ▲  useSyncExternalStore            ▼
  │     └──── HudState store ◄──── Simulation (pure rules, fixed step)
  │                                        ▲
  │                                   InputController (keyboard + touch)
  │
  ├─ CaptainsLog ─► TanStack Query ─► Axios ─► /api/* ─► MSW (service worker) ─► localStorage "db"
  └─ ResultScreen ─► useMatchSubmitter ─► outbox (localStorage) ─► POST /api/matches
```

| Layer | Location | Knows about |
| --- | --- | --- |
| Rules | `src/game/sim/` | Nothing outside itself: no PixiJS, React or DOM |
| Rendering | `src/game/render/` | Simulation state (read-only), PixiJS, textures |
| Input | `src/game/input/` | DOM keyboard events; produces an `InputState` snapshot |
| Match lifecycle | `src/game/GameSession.ts` | Wires sim + renderer + input; owns the Pixi app; publishes HUD state |
| UI | `src/ui/`, `src/app/` | React screens; talks to the game only through `GameSession` and its store |
| Remote data | `src/api/` | Contracts, Axios, TanStack Query, outbox |
| Mocks | `src/mocks/` | MSW handlers, storage, fixtures, scenarios |

## React ↔ PixiJS integration

- PixiJS is used **imperatively**, without `@pixi/react`. `MatchScreen` renders an empty host `<div>` and, in an effect, creates a `GameSession` that mounts a Pixi `Application` into it. React never renders anything inside the canvas.
- **Strict Mode:** React mounts, unmounts and mounts effects again in development. `GameSession.destroy()` is idempotent and safe while the asynchronous `app.init()` is still pending: if the session was destroyed during init, the new app is destroyed as soon as init resolves. Tests assert that there is never more than one canvas.
- **No per-frame React renders:** the HUD reads a tiny external store (`src/game/store.ts`) through `useSyncExternalStore`. The session calls `store.set()` after every simulation advance, but `set` only notifies when a value really changes. Time is published as whole seconds, so the HUD re-renders at most about once per second plus on score/health changes.
- **Restart** creates a brand new session: `MatchScreen` is keyed by the match id. There is no "reset fields" code path that could leave state behind.
- **Accessibility of the game state:** the HUD is semantic HTML (labelled health, score and time). Two `aria-live="polite"` regions announce the score and pause/end state when they change, and the remaining time only at 60/30/10 s, never every frame.

## Simulation loop

`Simulation` (`src/game/sim/Simulation.ts`) holds all continuous combat state: ships, projectiles, timer, score and spawns. It only advances through `step(dt, input)`.

- **Fixed time step:** `GameSession.advance(seconds)` adds the frame time to an accumulator and runs whole steps of `FIXED_DT = 1/60 s`. Each frame's time is clamped to 0.1 s, so a stalled tab never triggers a burst of catch-up steps. Movement, cooldowns, spawn timers and the match clock depend only on game time, so they are frame-rate independent.
- **Order of systems in a step:** player (turn, move, cooldowns, fire) → enemies (steering, movement, shooter fire) → projectiles (move, range, arena bounds, islands, hits) → chaser impacts → ship separation → spawns → removal of dead entities → end conditions.
- **Events:** each step emits typed events (`shot`, `hit`, `splash`, `shipDestroyed`, `spawn`, `matchEnded`). The renderer turns them into effects, so the rules never call rendering code.
- **End of match:** when health reaches 0 (`destroyed`) or active time reaches the configured duration (`time_up`), the status becomes `ended` and `step` becomes a no-op: no movement, attacks, damage, spawns or points. If both happen in the same step, `destroyed` wins. `matchEnded` is emitted exactly once.
- **Pause:** manual (button, `Esc`, `P`) or automatic (`window.blur`, `visibilitychange` to hidden). While paused the session does not advance the simulation, the accumulator is reset and the keyboard listeners are removed. On resume the accumulator and held inputs are cleared, so no movement or shots from the paused period carry over. Returning to the tab does not resume by itself.
- **Determinism:** every random choice in the rules uses a seeded PRNG (mulberry32), so a seed and a sequence of inputs always produce the same match.

## Collisions

Shapes are kept simple and predictable:

| Pair | Shapes | Resolution |
| --- | --- | --- |
| Ship × island | circle × axis-aligned rect | push out along the closest point (slides along the edge) |
| Ship × arena edge | circle × bounds | clamp |
| Ship × ship | circle × circle | separation; the player pushes enemies away. Chaser × player is an impact instead |
| Projectile × island | point × rect | removed, splash effect |
| Projectile × ship | circle × circle (projectile radius 5) | damage once, then removed |

- **Islands** are rectangles: each island's tile footprint minus its transparent rounded border (inset 12 px for sand islands, 10 px for grass islands). The map is data in `src/game/sim/arenaMap.ts`.
- **One hit, one damage:** a projectile is marked dead in the same step it hits and is skipped from then on. Projectiles are removed on hit, on an island, out of the arena or when their range runs out. Speeds keep the per-step travel (≈ 10 px) well below ship radii (24–26 px), so shots do not tunnel through ships.
- **Destroyed enemies** become `alive = false` immediately. They are filtered out of every system, so they cannot collide, fire or deal damage while their wreck animation plays in the renderer.

## Enemy behaviour and spawning

- **Line of sight:** segment vs island rects (slab test).
- **Navigation:** when an island blocks the direct line, enemies follow a **BFS flow field** (32 px grid, 8 neighbours, no corner cutting) towards the player's cell. It is rebuilt only when the player changes cell. Enemies never get stuck behind islands, and there is no per-enemy pathfinding cost.
- **Chaser:** steers towards the player at a limited turn rate and slows down on sharp turns, so it does not orbit forever. On contact it deals impact damage and explodes without scoring.
- **Shooter:** approaches until its preferred distance. It fires only when the player is within attack range, in line of sight and inside its aim tolerance, respecting its cooldown.
- **Spawns** happen every `spawnIntervalSec` of active time, at a random point that is clear of islands (24 px margin), not overlapping other enemies and at least `spawnMinDistance` away from the player (with a half-distance fallback when the arena is crowded). The first two spawns are a chaser and a shooter, so both types appear in every match; after that the type follows the configured weights. `maxEnemies` caps the number of live enemies.

## Rendering and resource management

- **Assets** (`src/game/assets/gameAssets.ts`): the ship atlas (converted from Starling XML to TexturePacker JSON by `scripts/convert-atlas.mjs`), the UI atlas (retina version when `devicePixelRatio ≥ 1.5`), the tilesheet and the water tile. They are loaded once with `Assets.load` and a progress callback, then reused by every match.
  - Each loaded entry is **validated** (spritesheet or texture of the expected type) before a match can start.
  - On failure the loading screen shows an error with Retry. PixiJS drops failed loads from its cache, so a retry only re-fetches what failed.
  - The loading screen ignores progress events that arrive after a failure, so an error is never replaced by a progress bar.
- **Layers:** water (`TilingSprite`), islands and decorations (static tile sprites), ships, projectiles, effects, health bars. Health bars live in their own layer so they do not rotate with the ships.
- **Sprites:** one view per live ship, created on first sight and destroyed when the ship disappears. Projectile sprites are **pooled**. Effects (muzzle flash, hit, splash, explosion, sinking wreck) are short-lived sprites animated in game time, so they freeze when paused. Ship textures switch between intact, damaged and heavily damaged as health drops, and fire appears on damaged ships.
- **Screen fit:** the arena has a fixed logical size (1920×1080). It is letterboxed into the canvas at `resolution = min(devicePixelRatio, 2)` with `autoDensity`, and refitted on every renderer resize. Rules and input never depend on screen size.
- **Teardown:** `GameSession.destroy()` removes the window/document listeners (keyboard, blur, visibility), clears the end-of-match timer, removes the ticker callback and resize listener, destroys every sprite and container, and destroys the Pixi app with its canvas. Shared atlas textures are kept (`texture: false, textureSource: false`) so the next match reuses them.

## Audio

`src/game/audio/audio.ts` plays the provided WAV files through the Web Audio API (no extra dependency).

- **Unlock and loading:** the `AudioContext` is created and resumed on the first button click, a user gesture (browser autoplay policy). All buffers are then fetched and decoded in the background. A sound that is not decoded yet is skipped, and audio failures only log a warning, so they never block the game.
- **Game events:** the session hands every batch of simulation events to `audio.handleEvents`, which maps them to sounds: bow and enemy cannon fire, broadside, splash, wood hit, explosion, chaser collision, score, sinking, time up and game over. Each sound plays at most once per batch, so a three-shot broadside is one sound.
- **Session state:** the session plays start, pause and resume cues, the low-health warning (crossing 30 % health) and the time warning (10 s left). It loops the ocean ambience during play and the sailing loop while the ship moves forward. All loops stop on pause, on match end and on teardown.
- **Settings:** mute is a persisted setting (`pirate-battle:sound-muted:v1`) with a toggle in the menu and in the pause dialog.
- **Tests:** audio is disabled with `?test` unless `?sound` is present. `played` counters let a test verify which sounds actually played.

## Orientation

Landscape is the supported orientation on touch devices. A `(orientation: portrait) and (pointer: coarse)` media query pauses the match. The pause dialog then asks the player to rotate, Resume and Escape are disabled, and the touch pad is hidden. The HUD wraps instead of overflowing. Back in landscape, the player resumes explicitly. Resizing never changes the simulation: the arena keeps its logical size and is only refitted to the canvas.

## Local persistence

| Key (`localStorage`) | Content | Notes |
| --- | --- | --- |
| `pirate-battle:options:v1` | Player options | Validated on read; corrupted values fall back to defaults |
| `pirate-battle:player:v1` | `playerId` (UUID) and captain name | Created on the first visit |
| `pirate-battle:last-result:v1` | Last completed `MatchRecord` | Shown in the menu and restored on the result screen |
| `pirate-battle:pending-matches:v1` | Outbox of matches not yet confirmed | `sending` becomes `pending` again after a refresh |
| `pirate-battle:mockdb:v1` | Mock API "server" storage | Seeded with fixtures; reset from the scenario panel |
| `pirate-battle:scenario:v1` | Selected network scenario | Also settable with `?scenario=` |
| `pirate-battle:sound-muted:v1` | Sound on/off | Toggle in the menu and pause dialog |

The result screen uses the URL hash `#result`, so reloading it shows the same result and its registration status. A match in progress has no hash: reloading returns to the menu and the match is abandoned, so it is never registered.

## Ranking and match history

### Contracts (`src/api/contracts.ts`)

```ts
interface MatchRecord {
  matchId: string; playerId: string; playerName: string
  playedAt: string            // ISO, end of the match
  score: number; durationSec: number   // effective played time
  endReason: 'time_up' | 'destroyed'
  config: { durationSec: number; spawnIntervalSec: number }
  configKey: string           // "120-3": only matches with the same key are compared
}
interface Page<T> { items: T[]; page: number; pageSize: number; totalItems: number; totalPages: number }
interface RankingEntry extends MatchRecord { rank: number }
```

**Which configuration a record stores.** `config` holds the two values the player can change: session time and spawn interval. All other tuning (health, speeds, damage, cooldowns, spawn weights, enemy cap) comes from `DEFAULT_CONFIG` and is fixed per build. Players cannot change it, so within a release those two values fully identify the rules a match was played with, and `configKey` ("120-3") groups comparable matches in the ranking. This is a deliberate choice that keeps the contract small. If balancing ever changes between releases, add a version or a hash of the full config snapshot to `configKey`, so matches played under different rules land in separate rankings.

| Endpoint | Behaviour |
| --- | --- |
| `GET /api/ranking?configKey&page&pageSize` | Matches with the same configuration. Deterministic order: score desc → earlier match first → `matchId` |
| `GET /api/players/:playerId/matches?page&pageSize` | The player's matches, newest first |
| `POST /api/matches` (header `Idempotency-Key: <matchId>`) | `201` on create; `200` with the stored record if the `matchId` already exists; `400` for invalid payloads |

### Client (`src/api/client.ts`, `src/api/queries.ts`)

- Axios instance with `baseURL /api` and a 4 s timeout. Queries pass TanStack Query's `AbortSignal`, so superseded requests are cancelled.
- Query keys: `['ranking', configKey, page]` and `['history', playerId, page]`.
- `staleTime` 10 s and `refetchOnMount: 'always'`, so tabs refresh every time they are shown again. `placeholderData: keepPreviousData` avoids flicker while paging.
- **Retries** only for retryable errors (timeout, connection error, 5xx), never for 4xx: up to 2 for queries with backoff (≤ 2 s), 1 for the save mutation.
- **UI states:** loading, empty, error with Try again (`role="alert"`), "Updating…" while refetching, and "Showing saved data" when a refresh fails but cached data exists.
- **Late responses cannot overwrite newer data:** each page has its own cache entry, superseded requests are aborted, and invalidation cancels refetches in flight. The page label follows the requested page.

### Registration and recovery

1. When a match ends, the app builds a `MatchRecord` whose `matchId` is the match id generated at start. It saves it as the last result and **adds it to the outbox before the first request**.
2. `useMatchSubmitter` sends it with `useMutation`. An in-memory set of in-flight ids ensures the same match is never sent twice at once (repeated clicks, Strict Mode double effects, overlapping flushes).
3. On success (201 or 200) the entry leaves the outbox and both `ranking` and `history` queries are invalidated, so both tabs update.
4. On failure the entry stays in the outbox as `failed`, with a readable reason. The result screen offers **Retry save** and the menu shows the number of pending battles.
5. The outbox is flushed on app start, on the `online` event, when the network scenario changes, and on demand. Starting a new match never waits for it.
6. **No duplicates:** the server is idempotent by `matchId`. A timeout after the server already stored the match (`post-timeout-after-commit`) is recovered by the retry, which receives the stored record.

API failures never block the game, the options or a running match. The only things that depend on the API are the two tabs and the registration status.

## MSW mocks

- The same handlers (`src/mocks/handlers.ts`) run in development, in the tests and in the **published build**. The worker starts before React renders. If it fails to start, the game still opens.
- The "server" persists to `localStorage`, so confirmed records appear in later queries and survive refreshes. Fixtures for other captains are generated with a fixed-seed PRNG.
- Scenarios are read on every request, so switching them in the panel takes effect immediately. Latency is fixed per scenario, except `jitter`, which uses a seeded PRNG.

## Testing

- **Playwright** E2E suite in `tests/e2e/`: one spec per required area (01–12) plus visual regression (13). It runs on Chromium desktop and Chromium mobile (Pixel 7, landscape, touch) against `npm run build && npm run preview`.
- **Test instrumentation** is only active with `?test`. It exposes the running session (read-only observation plus `advance`, `pause` and `resume`). It also accepts per-test config overrides and a fault-injection flag for asset loading. A **manual clock** makes the ticker render only, while `advance()` runs real simulation steps. Tests drive the game with real keyboard and pointer events. `Simulation.stats` counters (shots, hits, kills, impacts) let tests prove "damage once" and "score once".
- `page.route()` cannot intercept requests handled by a service worker, and MSW owns one. Asset failures are therefore injected by the app (`failAssetsOnce`), which requests a file that does not exist.
- **Visual baselines** are stored without an OS suffix. Before each capture, the tests wait for every image (including CSS `background-image`/`border-image`) and font to be decoded.

### Cross-platform validation of the visual tolerance

Baselines must work on the evaluator's machine, not only on the one that generated them. This was validated as follows:

1. Baselines first generated on Windows were run on Linux (official Playwright image, clean `npm ci`). Two of six captures failed with **7 %** and **8 %** differences. The cause was system fonts: Segoe UI on Windows and a different font on Linux have different metrics, and "BATTLE COMPLETE" wrapped onto two lines on Windows only. No tolerance can fix a layout shift.
2. **Fix at the source:** the UI now uses a bundled web font (Roboto, `@fontsource/roboto`, OFL). Text metrics are identical on every OS.
3. Baselines were regenerated on Linux and compared on Windows with zero tolerance to measure the real difference:

| Capture | Pixels | Difference (default threshold 0.2) | Difference (threshold 0.3) |
| --- | ---: | ---: | ---: |
| menu · desktop | 921,600 | < 1 % | 0.23 % |
| arena · desktop | 921,600 | 0.02 % | 0.02 % |
| result · desktop | 921,600 | 0.44 % | 0.28 % |
| menu · mobile | 310,680 | 0.38 % | 0.25 % |
| arena · mobile | 310,680 | 0.23 % | 0.13 % |
| result · mobile | 310,680 | **2.85 %** | **1.79 %** |

The remaining differences are anti-aliasing of text and of the scaled panel borders. With the default per-pixel threshold the worst case (2.85 %) was too close to the 3 % budget to be reliable. With `threshold: 0.3` the worst case is 1.79 %, leaving a margin of 1.2 points.

The budget still catches real regressions found during development: a panel rendered before its image loaded (59 % difference) and the font layout shift above (7–8 %). The final configuration is `threshold: 0.3` and `maxDiffPixelRatio: 0.03`. Baselines are generated on Linux (`npm run test:e2e:docker -- 13-visual --update-snapshots`), and the full suite passes on both Windows and Linux.

### Cross-platform install

The same clean-checkout run found that `npm ci` failed on Linux. `npm install` on Windows removes Linux-only optional packages (`@emnapi/*`, needed by the Rolldown bundler) from `package-lock.json`, a known npm issue with optional dependencies. The lockfile is therefore generated inside the Linux image and verified with `npm ci` on both Linux and Windows. After changing dependencies, run `npm run lockfile:linux` (`scripts/lockfile-linux.sh`).

## Balancing decisions

- The player out-guns any single enemy but not a crowd. The bow cannon kills a chaser in 2 hits and a shooter in 3; a full broadside (3 × 20) kills a chaser at once. Broadsides trade a longer cooldown (1.2 s) for area coverage.
- Chasers are slower than the player (120 vs 170 px/s) and turn slower (2.2 vs 2.6 rad/s), so a skilled player can outmanoeuvre them. They come in numbers, though, and their impact (20 HP) makes ignoring them costly.
- Shooters are slow and fragile at range but chip damage (8 per hit, every 1.8 s), so standing still is punished.
- With the defaults (120 s, spawn every 3 s), a scripted aim-and-fire bot scored 31–38 points (similar to the challenge mockups), and an idle player sinks in about 18 s.
- The first two spawns are fixed (chaser, then shooter) so both enemy types always appear early.

## Limitations

- Islands use rectangular collision shapes, approximating their rounded outline.
- The whole arena is always visible and scaled to fit; there is no camera, so ships are small on phones.
- Audio files are the provided WAVs (~5.8 MB), loaded in the background after the first click. A compressed format would load faster on mobile networks.
- The mocked API runs in the browser: data is per browser profile, and the "other players" are fixtures.
- In headless Chromium (software WebGL) the frame rate is low; the frame-time clamp then slows the game in real time. Tests use the manual clock.
