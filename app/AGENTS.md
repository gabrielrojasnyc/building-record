<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes: APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev`: verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## State in this app

A part of the screen that can be in one of several states says so in one typed value, and changes it in one place. Do not add a second true or false flag beside one of these. Add a state to the union, and let the compiler show every place that has to answer for it.

- **The map screen** (`src/ui/finderState.ts`, used by `Finder.tsx`): the map (`starting`, `ready` or `unavailable`), the open building, its model, the count's hold and the camera's next move. It changes only through `step(state, event)`. Something new that can happen is a new `FinderEvent`. Test it in `finderState.test.ts`, which needs no browser.
- **The map** (`src/map/BuildingMap.tsx`): `Status` is `starting`, `ready` or `unavailable`. It tells the screen it is up by reporting the ground it shows (`onViewAreaChange`), and that it gave up, once and for good, through `onUnavailable`.
- **The spotlight** (`src/map/spotlight.ts`): `Motion` is `flying`, `turning` or `still`. Its other bookkeeping follows MapLibre's own events and is pinned, case by case, by the spotlight tests in `BuildingMap.test.tsx`. Change it only with a failing test first.
- **The search** (`src/ui/suggestions.ts`, used by `IntroSearch.tsx`): what shows under the box is `closed`, `listing`, `looking`, `unavailable` or `none`, worked out by `suggestionsFor`.
- **Anything loaded** (`LoadState` in `src/ui/BuildingPanel.tsx`): `loading`, `ready` with its value, or `failed`. The parts of a record are handed the value itself, or the word `"loading"` or `"failed"`.

### Reading state from the page

For a browser test, or an agent driving the site:

- `main[data-map]`: `starting`, `ready` or `unavailable`.
- `[data-spotlight="<complex id>"]`: that building's model is standing on the map.
- `aside[aria-busy="true"]`: the open record is still waiting for its building file.
- `[data-suggestions]`: the search's state, as listed above.
- `img[data-loaded]`: the record's aerial photo is in (`true`) or not yet (`false`).
- The address: `?building=<complex id>` names the open building, after the filters (`period`, `category`, `ro`, `order`). Opening the page with it opens that building, so it is also the way to put the site in that state. Only `Finder.tsx` writes it, and it follows the screen's state, never the other way round after the page has opened.
