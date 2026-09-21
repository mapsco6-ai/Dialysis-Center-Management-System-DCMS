# Plan: Global loader and background API requests

Date: 14 September 2026.
Follows up [api-requests-without-loader.md](api-requests-without-loader.md). The analysis below was
reviewed against the code and cross-checked in a read-only second-opinion review (Codex,
`gpt-6-astra`); points it corrected or added are included.

## 1. Current design

- Every HTTP call goes through `apiFetch` / `apiFetchBlob` in
  [apps/web/src/lib/api.ts](../apps/web/src/lib/api.ts). Both increment a module-level
  `pendingRequestCount` before the request and decrement it in `finally`.
- [useApiLoading.ts](../apps/web/src/lib/useApiLoading.ts) exposes `count > 0` through
  `useSyncExternalStore`.
- [GlobalLoader.tsx](../apps/web/src/components/GlobalLoader.tsx), mounted once in
  [layout.tsx](../apps/web/src/app/layout.tsx), shows a full-screen overlay once the count has been
  above zero for 150ms. The overlay (`.global-loader` in
  [globals.css](../apps/web/src/app/globals.css)) is `position: fixed; inset: 0; z-index: 200` with a
  translucent background and blur.

**Why it exists.** One place tracks every request, with no per-page spinner state and no
state-management library.

**Why polling exists.** Clinical and machine state must stay close to real time. WebSocket push
([useLiveUpdates.ts](../apps/web/src/lib/useLiveUpdates.ts)) is only used by the dashboard, and its own
comment says callers must keep polling as a safety net if the socket never connects.

## 2. The problem

Background refreshes use the same `apiFetch`, so they drive the same overlay as user actions.

| Page | Refresh function | Interval |
|---|---|---|
| [admin/page.tsx](../apps/web/src/app/admin/page.tsx) | `refresh` in 3 dashboard panels, plus refreshes triggered by socket events (`:97`, `:144`, `:204`) | 30s |
| [admin/machines/page.tsx](../apps/web/src/app/admin/machines/page.tsx) | `refresh` (up to 3 requests) | 15s |
| [admin/sessions/[id]/page.tsx](../apps/web/src/app/admin/sessions/%5Bid%5D/page.tsx) | `refresh` (3 requests) | 15s |
| [admin/nursing/page.tsx](../apps/web/src/app/admin/nursing/page.tsx) | `refreshDashboard` | 15s |
| [admin/pharmacy/page.tsx](../apps/web/src/app/admin/pharmacy/page.tsx) | `refreshQueue` | 15s |
| [admin/schedule/page.tsx](../apps/web/src/app/admin/schedule/page.tsx) | `load(false)`, today only | 15s |
| [admin/lab/page.tsx](../apps/web/src/app/admin/lab/page.tsx) | `refreshQueue` | 15s |
| [admin/maintenance/page.tsx](../apps/web/src/app/admin/maintenance/page.tsx) | `refresh` | 15s |

### Impact

1. **Flicker.** The overlay appears during normal reading whenever a background request takes longer
   than 150ms.
2. **Lost clicks (highest risk).** The overlay has no `pointer-events: none`, so while it is visible it
   intercepts clicks. On the live session page, a nurse's click can land on the overlay instead of
   the control.
3. **Feedback loses meaning.** A save in progress and a background refresh look identical.
4. **Slow networks.** Intervals don't wait for the previous refresh to finish. Overlapping requests
   can keep the count above zero, so the overlay stays up most of the time.
5. **No accessible text.** The `role="status"` region contains only a CSS-drawn spinner, with nothing
   for screen readers to announce.

### Related defects found during review

6. **The count drops before the body is read.** `return response.json()` (`api.ts:80`) and
   `return response.blob()` (`api.ts:100`) sit inside `try/finally`. In an async function the
   `finally` block runs before the returned promise settles, so the count decrements before the body
   is consumed. Fix: `return await`.
7. **A failed refresh empties clinical data.** For example, the session page sets readings and events
   to `[]` on failure (`sessions/[id]/page.tsx:61`, `:64`). The screen then shows "no records" instead
   of "could not refresh".
8. **Stale responses can overwrite newer ones.** Clearing an interval doesn't cancel requests that
   are already in flight. A slow older response can land after a newer one.
9. **The overlay is not a submit lock.** It doesn't disable controls or trap keyboard input.
   Double-submit protection must stay local to each form (the existing `busy` flags).

## 3. Rejected alternatives

- **Show the overlay only for non-GET requests.** Exports, blob downloads and navigation loads are
  GETs that deserve feedback, and most pages have no local initial-load state.
- **Only add `pointer-events: none`.** This fixes lost clicks, but the blur still flashes over the
  content. It is kept below as an immediate mitigation, not the fix.
- **Replace polling with WebSocket push everywhere.** Push today only triggers the same REST
  refetches, so it needs silent requests anyway, plus reconnect handling. Longer-term, out of scope.

## 4. Implementation plan

### Phase 1: Stop background requests from driving the loader

1. **Opt-out flag in `api.ts`.**

   ```ts
   type ApiRequestOptions = { silent?: boolean };

   export async function apiFetch(path: string, options: RequestInit = {}, { silent = false }: ApiRequestOptions = {}) {
     if (!silent) beginRequest();
     try {
       // ...unchanged...
       return await response.json();
     } finally {
       if (!silent) endRequest();
     }
   }
   ```

   - Apply the same change to `apiFetchBlob(path, { silent })`.
   - The increment and the decrement must check the same captured flag.
   - The default stays non-silent, so existing call sites are unchanged.
2. **Fix the early decrement (defect 6).** Use `return await` in both helpers.
3. **Pass `silent` through each refresh function.** Change each polling function to take a flag and
   forward it to every `apiFetch` inside it:

   ```ts
   function refresh({ silent = false } = {}) {
     apiFetch("/wards", {}, { silent }).then(setWards)...
     apiFetch("/machines", {}, { silent }).then(setMachines)...
   }

   useEffect(() => {
     refresh();                                                // first load: loader shown
     const interval = setInterval(() => refresh({ silent: true }), POLL_MS);
     return () => clearInterval(interval);
   }, [user]);
   ```

   - **Silent:** interval ticks and socket-triggered refreshes (`admin/page.tsx`).
   - **Not silent:** the first load, filter or date changes (e.g. maintenance `statusFilter`, schedule
     `date`), and refreshes right after a user action (e.g. `refresh()` inside `submit` on the
     session page).
   - `schedule/page.tsx` already has `load(showSpinner)`: pass `silent: !showSpinner`.
4. **Immediate overlay mitigation.**
   - Add `pointer-events: none` to `.global-loader`.
   - Add visually hidden text inside the status region, e.g. `t("جاري التحميل...", "Loading...")`.

**Files:** `apps/web/src/lib/api.ts`, `apps/web/src/components/GlobalLoader.tsx`,
`apps/web/src/app/globals.css`, and the 8 pages in the table.

### Phase 2: Shared polling hook

Add `apps/web/src/lib/usePolling.ts` to replace the duplicated `setInterval` blocks:

```ts
usePolling((signal) => refresh({ silent: true, signal }), POLL_MS, { enabled: Boolean(user) });
```

- **No overlap.** Schedule the next tick only after the current refresh settles (a `setTimeout`
  chain). This requires refresh functions to return their promise, e.g.
  `Promise.allSettled([...])`, instead of `void`.
- **Ignore stale responses (defect 8).** Pass an `AbortSignal` into `apiFetch` through
  `options.signal` and abort it on unmount, dependency change, or when a newer refresh starts.
- **Pause when hidden.** Stop ticking while `document.visibilityState === "hidden"`, and run one
  silent refresh immediately when the tab becomes visible again.
- **Keep the first load in the page.** The first load stays a normal non-silent call, so the hook
  handles only background ticks.

Migrate the 8 pages one at a time; each migration is independent.

### Phase 3: Better background-failure and loading UX

1. **Keep last good data on failed refreshes (defect 7).** On a silent refresh failure, don't reset
   state to `[]` or `null`. Keep the previous data and show a small "Could not refresh, showing data
   from HH:MM" notice. A failed first load still shows the error as it does today.
2. **Non-blocking progress bar.** Replace the full-screen overlay with a thin bar fixed to the top of
   `.workspace-content` or the viewport.
   - Still driven by `useApiLoading`, which by then only counts user-initiated requests.
   - Respect `data-reduced-motion`.
   - Keep the accessible text from Phase 1.
3. **Local loading states.** Where a page has no initial-load UI, add a skeleton or "Loading…" state
   like `sessions/[id]/page.tsx:98` and `schedule/page.tsx:167`, so the page doesn't rely on the global
   indicator alone.

## 5. Verification

**Automated (in `apps/web`)**

- `npx tsc --noEmit` and `npm run build` pass.
- `npm run test:ui` (Playwright, `tests/ui/`) passes. Add a spec that stubs the API with a delayed
  response and asserts:
  - The loader appears on first page load and on a save.
  - The loader does not appear during a polling tick (use `page.clock` to advance past `POLL_MS`).
  - Clicks during a slow request still reach the button once Phase 1 step 4 is done.

**Manual**

- Open `/admin/machines` and `/admin/sessions/[id]` with DevTools network throttling set to "Slow 4G":
  - Initial load shows the loader.
  - 15s ticks appear in the Network tab with no overlay.
  - Saving a reading shows the loader.
- Dashboard `/admin`: trigger a machine status change from another tab. The socket-driven refresh
  updates the panel without the overlay.
- Phase 2: switch tabs for over 30s. No requests are sent while hidden, and one refresh runs on return.
- Phase 3: stop the API while on the session page. Existing readings stay visible with the
  "could not refresh" notice.

## 6. Out of scope

- Replacing polling with WebSocket push on all pages.
- Server-side changes.
