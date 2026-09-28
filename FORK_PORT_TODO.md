# Porting mathancy/fluxer (refactor) onto upstream fluxerapp/fluxer (main)

## Why this file exists

Your fork (`mathancy/fluxer`, branch `refactor`) diverged from `fluxerapp/fluxer:main`
1,344 commits ago. In that time upstream did two big structural rewrites that affect
almost every file your fork touched:

1. **Backend**: `packages/api/**` was renamed/reorganized to `fluxer_api/src/api/**`
   (also `.tsx` → `.ts`), and `packages/api/src/middleware/ServiceMiddleware.tsx`
   went from an eagerly-constructed function to a class of lazy getters
   (`RequestServices`, wired up via `installLazyServices`).
2. **Frontend**: `fluxer_app/src/stores/**` (mobx stores + a manual
   `stores/gateway/handlers/index.tsx` registry) was replaced by
   `fluxer_app/src/features/*/state/**` plus a `Map`-based registry in
   `fluxer_app/src/features/gateway/events/EventRouter.ts`, where every gateway
   event is a standalone `handleXxx(data, context)` function.

Because of this, none of your fork's commits apply cleanly — `git rebase`/`cherry-pick`
produces either text conflicts or, worse, silently drops code into the old (deleted)
directories. Each commit below needs a human (or an agent with full context) to
read the old code, find the new equivalent pattern, and re-implement — not just
resolve a diff.

## Current state

- Branch `refactor` in this repo = upstream `main` (current, as of the port date)
  **plus 2 of your 10 fork-only commits**, ported and adapted to the new architecture:
  - ✅ `feat(whiteboard): add Excalidraw dependency and rspack aliases`
  - ✅ `feat(whiteboard): add whiteboard API endpoints` (backend: rate limit config,
    `WhiteboardController`, `WhiteboardService`, `WhiteboardSchemas`, wired into
    `ControllerRegistry`, `ServiceMiddleware`, `HonoEnv`, `RateLimitConfig`, and the
    `GatewayDispatchEvent` union got `WHITEBOARD_UPDATE`/`WHITEBOARD_CURSOR` added).
- Remotes: `origin` = your fork (`mathancy/fluxer`), `upstream` = `fluxerapp/fluxer`.
- `pnpm-lock.yaml` was **not** hand-merged — it was left as upstream `main`'s version.
  **Run `pnpm install` before building** to regenerate it against the two new deps
  (`@excalidraw/excalidraw`, `roughjs`, `pica`, `image-blob-reduce`, `process`,
  `highlight.js`, `react-select`, `react-modal-sheet`, `react-zoom-pan-pinch`) added
  to `fluxer_app/package.json` and `pnpm-workspace.yaml`.
- A full copy of your original fork (unmodified, stale) is still fetchable — see
  "Getting the original fork code back" below.

## Remaining work, in a sane order

### 1. `feat(whiteboard): add Excalidraw canvas with sync and persistence` (fork commit `58d6b234a`)
The big one — ~1,127 lines. Original files (all under the dead `stores/` architecture):
- `fluxer_app/src/apps/whiteboard/WhiteboardApp.tsx` (146 lines) + `.module.css` — the
  Excalidraw canvas component itself. Should port with only import-path changes.
- `fluxer_app/src/apps/whiteboard/useWhiteboardSync.tsx` (411 lines) — server
  save/load, localStorage fallback, debounced autosave, reconcile-based remote
  updates. Needs to read from/write to the new `whiteboardService`/REST endpoints
  we already ported, and use whatever the current channel-scoped data-fetch
  convention is (look at how another per-channel feature, e.g. call state, is
  hooked up under `fluxer_app/src/features/voice/` for the pattern).
- `fluxer_app/src/stores/WhiteboardStore.tsx` (114 lines) — **delete**; this pattern
  is gone. Its job (holding per-channel whiteboard gateway state) should become a
  new file under `fluxer_app/src/features/<something>/state/` (whiteboard doesn't
  have a feature folder yet — you'll need to create
  `fluxer_app/src/features/whiteboard/` or similar, following the shape of e.g.
  `fluxer_app/src/features/channel/state/Channels.ts`).
- `fluxer_app/src/stores/gateway/handlers/channel/WhiteboardUpdate.tsx` (26 lines) →
  becomes a `handleWhiteboardUpdate(data, context)` function exported from
  `fluxer_app/src/features/<whiteboard-feature>/events/WhiteboardUpdate.ts`
  (mirror `fluxer_app/src/features/channel/events/ChannelUpdate.ts`), then
  registered in `fluxer_app/src/features/gateway/events/EventRouter.ts`
  (`registry.set('WHITEBOARD_UPDATE', handleWhiteboardUpdate as GatewayEventHandler)`).
- `fluxer_app/src/components/channel/channel_view/GuildChannelView.tsx` — 6-line
  addition to render `<WhiteboardApp key={channelId} />` for whiteboard-type
  channels. Current `GuildChannelView.tsx` has moved/changed around it, but the
  splice point should be easy to find (search for how other channel-type-specific
  renders — e.g. call view — are gated in that file).

### 2. `feat(whiteboard): integrate whiteboard channels into UI` (fork commit `7ec1e9664`)
Smaller (70 lines / 8 files) — channel list rendering, header, context menu, bottom
sheet, `ChannelUtils` helpers for the whiteboard channel type. All files still exist
in the new tree (just check current import paths):
`ChannelDetailsBottomSheet.tsx`, `useChannelHeaderData.tsx`, `ChannelListContent.tsx`,
`ChannelOrganization.tsx`, `ChannelContextMenu.tsx`, `ChannelMenuData.tsx`,
`ChannelMenuItems.tsx`, `ChannelUtils.tsx`. Depends on #1 existing first (references
`WhiteboardApp`/whiteboard channel type helpers).

### 3. `feat(whiteboard): add real-time collaborative cursor tracking` (fork commit `03665bcb8`)
- Backend: add `WHITEBOARD_CURSOR` to `fluxer_gateway/src/guild/guild_dispatch.erl`
  (Erlang gateway dispatcher — small, additive, 2 lines in the original). Check the
  current file still uses an atom-list dispatch pattern before copying verbatim.
  `WHITEBOARD_CURSOR` is already in the TS `GatewayDispatchEvent` union (done in
  commit 2's port).
- Frontend: `useWhiteboardCursors.tsx` (406 lines — profile picture overlay,
  exponential-smoothing interpolation, per-user color selection boxes) plus a
  `WhiteboardCursorUpdate` gateway handler, same porting shape as #1's
  `WhiteboardUpdate` handler. The cursor-broadcast REST call
  (`ctx.get('whiteboardService').broadcastCursorUpdate(...)`) is **already wired**
  server-side from commit 2's port — this step is purely the frontend consumption +
  the Erlang dispatch line.

### 4. `feat(whiteboard): add per-channel dark mode default setting` (fork commit `0d81fe20a`)
Medium (99 lines / 14 files). Adds a `ChannelFlags.DARK_MODE_DEFAULT` bit, a Cassandra
migration adding a `flags` column to `channels`, threads `flags` through
`ChannelRow`/`Channel` model/mappers/create+update services, adds request-schema
fields, and a dark-mode toggle in the channel create modal + settings overview tab.
Every backend file here lived under the old `packages/api/**` — re-locate each to
`fluxer_api/src/api/**` (same mechanical process as commit 2, but check whether
`ChannelFlags`/a `flags` column already exists on `main` for unrelated reasons before
assuming a clean bit-0 claim — 1,344 commits is enough time for someone else to have
added channel flags already). Also note the original had a "fix flags serializer to
emit 0 correctly" fixup baked in — preserve that (`someValue || default` → direct
falsy-unsafe patterns are a real bug class, don't reintroduce it).

### 5. `feat(calendar): finalize calendar channel, permissions, and concurrency hardening` (fork commit `039c449e3`)
**Largest single commit: 45 files, ~3,930 lines.** This is effectively an entire
feature (calendar-type channels, permissions, concurrency handling) squashed into one
commit — its parent tree is already an ancestor of current `main`, so this commit
*is* the whole calendar feature, self-contained. Recommend tackling this as its own
multi-session project, not a quick pass: read the full commit (`git show 039c449e3`
in the reference clone below) end to end first to understand the feature shape,
identify the backend/frontend architecture split same as above, then port
domain-by-domain (schema → service → controller → gateway event → frontend state →
frontend UI), the same order used for whiteboard here.

### 6. `merge: bring calendar feature branch into refactor` (fork commit `7bf5cd1d5`)
No action needed — verified this merge commit's tree is **identical** to
`039c449e3`'s. It's a pure merge marker with no extra content. Skip it; #5 covers
everything.

### 7. `Merge upstream/refactor into refactor` (fork commit `47e37e530`)
Touched `IpBanMiddleware`, `ServiceMiddleware`, `VoiceTopology`,
`JetStreamWorkerQueue` (11 files / 196 lines) — this was your fork catching up to a
past snapshot of upstream's own `refactor` branch. Given current `main` is 1,344
commits past that point, **this is almost certainly already superseded** by main's
own evolution of those same files. Recommend: skip by default, but if something
whiteboard/calendar-adjacent breaks in a way that smells like a missing bugfix in
one of those four files, diff `47e37e530` against current `main` for that specific
file to check.

### 8. `Fix mixed channel reordering within categories` (fork commit `de266cf44`)
Smallest and fully independent of whiteboard/calendar (44 lines / 2 files:
`ChannelListContent.tsx` + a new `ChannelMoveOperation.test.tsx`). Good first task if
you want a quick win — `ChannelListContent.tsx` will already have conflicts from
step #2 above by the time you get here, so either do this one **first** (before #2),
or expect to re-resolve the same file twice.

## Suggested order

`de266cf44` (quick standalone fix) → `58d6b234a` (canvas, foundational) →
`7ec1e9664` (UI integration, depends on canvas) → `03665bcb8` (cursor tracking) →
`0d81fe20a` (dark mode) → `039c449e3` (calendar, biggest, do last/separately) →
skip `7bf5cd1d5` and `47e37e530`.

## Getting the original fork code back

Your original, unmodified fork history is one `git fetch` away — nothing was lost:

```sh
git fetch origin refactor:fork-original
git log --oneline main..fork-original   # the 10 original commits, unmodified
git show fork-original:path/to/file.tsx # read any original file at any point
```

Use this as the reference/source for the porting work above — every "original
file" mentioned in this doc lives on `fork-original`.

## Before building

```sh
pnpm install   # regenerates pnpm-lock.yaml against the new deps
```
