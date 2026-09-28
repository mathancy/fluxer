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

- Branch `main` in this repo = upstream `fluxerapp/fluxer:main` (current, as of the
  port date) **plus your fork's whiteboard work, ported and adapted to the new
  architecture**:
  - ✅ `feat(whiteboard): add Excalidraw dependency and rspack aliases`
  - ✅ `feat(whiteboard): add whiteboard API endpoints` (backend: rate limit config,
    `WhiteboardController`, `WhiteboardService`, `WhiteboardSchemas`, wired into
    `ControllerRegistry`, `ServiceMiddleware`, `HonoEnv`, `RateLimitConfig`, and the
    `GatewayDispatchEvent` union got `WHITEBOARD_UPDATE`/`WHITEBOARD_CURSOR` added).
  - ✅ `feat(whiteboard): add Excalidraw canvas with sync and persistence` — the
    actual canvas, `useWhiteboardSync`, `useWhiteboardCursors` (cursor hook exists
    but is inert until item #3 below wires up the gateway event), `WhiteboardStore`,
    `WhiteboardUpdate` gateway handler, and the `GuildChannelView` render branch —
    all under a new `fluxer_app/src/features/whiteboard/` feature folder.
  - ✅ Minimal creation + listing support so a whiteboard channel is actually
    creatable and clickable today: `ChannelCreateRequest`/`ChannelUpdateRequest`
    schema variants for `GUILD_WHITEBOARD`, a "Whiteboard Channel" option in the
    create-channel modal, and `organizeChannels()` lists it alongside text channels
    for now (see item #2 below for the follow-up: a dedicated list bucket + icon).
  - ⚠️ Dark mode theming is hardcoded to light for now — see item #4.
- Remotes: `origin` = your fork (`mathancy/fluxer`), `upstream` = `fluxerapp/fluxer`.
- ✅ `pnpm-lock.yaml` regenerated (`pnpm install`, pnpm 11.27.0) against the new deps
  (`@excalidraw/excalidraw`, `roughjs`, `pica`, `image-blob-reduce`, `process`,
  `highlight.js`, `react-select`, `react-modal-sheet`, `react-zoom-pan-pinch`).
  This was originally left deferred and broke CI's `pnpm install --frozen-lockfile`
  step in `build-api` and `build-app-proxy-self-hosted` — fixed now, but if you add
  more deps while working through the rest of this list, remember to re-run
  `pnpm install` and commit the lockfile before pushing/building.
- ✅ Fixed `.github/workflows/_build-image.yaml` and `build-app-proxy-self-hosted.yaml`:
  both had steps minting a GitHub App token hardcoded to `owner: fluxerapp`, which
  fails instantly on any fork. Removed (see the `ci:` commit for why each was safe
  to drop) — all 12 `build-*` workflows now run via `workflow_dispatch` on a fork.
- A full copy of your original fork (unmodified, stale) is still fetchable — see
  "Getting the original fork code back" below. Note: `mathancy/fluxer` was deleted
  and recreated partway through this port (to give it a clean `main` instead of the
  old `refactor` branch name), so the original history now lives on the
  `fork-original` branch of the *current* fork, not a separate old repo.

## Remaining work, in a sane order

### ~~1. `feat(whiteboard): add Excalidraw canvas with sync and persistence`~~ — done
Ported as `fluxer_app/src/features/whiteboard/**`. Plus the minimal creation/listing
support described above, so this is genuinely testable in a running instance now.

### 2. `feat(whiteboard): integrate whiteboard channels into UI` (fork commit `7ec1e9664`)
What's already covered by the minimal port above: creation (radio option) and basic
listing (lumped into the text-channel bucket, same precedent as `GUILD_LINK`).
Still open — the *proper* treatment from the original commit:
- A dedicated `whiteboardChannels` bucket in `ChannelOrganization.ts` (currently
  merged into `isTextChannel`) plus a distinct list-item icon, instead of reusing
  the text-channel row.
- Channel header support (`useChannelHeaderData.tsx`) — whiteboard channels
  currently get whatever header a text channel gets.
- Right-click context menu entries (`ChannelContextMenu.tsx`, `ChannelMenuData.tsx`,
  `ChannelMenuItems.tsx`) — mute/delete for whiteboard channels.
- Bottom sheet details (`ChannelDetailsBottomSheet.tsx`) on mobile.
- `ChannelUtils.tsx` whiteboard helpers the fork added for the above.
All files still exist in the new tree under `fluxer_app/src/features/app/components/layout/`
and `fluxer_app/src/features/channel/components/` — check current import paths per file.

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

`de266cf44` (quick standalone fix) → ~~`58d6b234a` (canvas, foundational)~~ done →
`7ec1e9664` (UI integration, depends on canvas) → `03665bcb8` (cursor tracking) →
`0d81fe20a` (dark mode) → `039c449e3` (calendar, biggest, do last/separately) →
skip `7bf5cd1d5` and `47e37e530`.

## Getting the original fork code back

Your original, unmodified fork history is one `git fetch` away — nothing was lost.
It lives on the `fork-original` branch of this same fork (pushed there during the
port, since the repo was deleted and recreated partway through to give it a clean
`main` instead of the old `refactor` name):

```sh
git fetch origin fork-original
git log --oneline main..origin/fork-original   # the 10 original commits, unmodified
git show origin/fork-original:path/to/file.tsx # read any original file at any point
```

Use this as the reference/source for the porting work above — every "original
file" mentioned in this doc lives on `fork-original`.

## Before building

`pnpm-lock.yaml` is up to date as of the last commit. If you add or bump a
dependency while working through the rest of this list, run `pnpm install`
(pnpm 11.27.0 — corepack picks this up automatically from `packageManager` in
`package.json`) and commit the updated lockfile before pushing, or CI's
`pnpm install --frozen-lockfile` step will fail the same way it did before.
