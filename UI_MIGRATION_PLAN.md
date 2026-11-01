# UI Migration Plan (Incremental)

## Goal
Migrate all UI rendering logic from `main.ts` into modular `src/ui/` modules without breaking functionality. Follow strangler pattern.

## Current State
- `main.ts` has `renderList()` (~300+ lines), `updateCounts()`, `filterAndRender()`, event bindings, etc.
- Created `src/ui/dom.ts`, `src/ui/render/list.ts` (skeleton), `src/ui/render/item.ts`, `src/ui/render/header.ts`, `src/ui/render/empty.ts`, `src/ui/render/settings.ts`, `src/ui/render/tabs.ts`
- Created `src/ui/events.ts`, `src/state/store.ts`
- Core logic (API/actions/shortcuts) already modularized

## Incremental Plan

### Step 1: Extract DOM utilities
- [x] Expand `src/ui/dom.ts` with helpers (createElement with attrs, classes)
- [x] Replace direct `getElementById` in main.ts gradually
- [x] Test build

### Step 2: Extract formatting/utils
- [x] Move `formatTime()`, `formatTTL()` to `src/utils/format.ts`
- [x] Move key normalization if needed to `src/utils/keys.ts`
- [x] Update imports in main.ts
- [x] Test

### Step 3: Create render modules
- [x] `src/ui/render/header.ts` - header actions, counts
- [x] `src/ui/render/settings.ts` - settings page rendering
- [x] `src/ui/render/empty.ts` - empty state
- [x] Migrate small render functions first

### Step 4: Migrate renderList incrementally
- [x] Move item creation helpers to `src/ui/render/item.ts`
- [ ] Move meta/badge/time rendering - integrate into main.ts gradually
- [ ] Move content rendering by type (text/image/file) to `src/ui/render/content.ts`
- [ ] Move actions row rendering - use helpers from item.ts
- [ ] Replace card creation in renderList with helpers
- [ ] Keep `renderList()` in main.ts as thin wrapper calling modules
- [ ] Test after each sub-step

**Subplan for Step 4 integration:**
1. Create `src/ui/render/content.ts` for type-specific content (text/image/file previews)
2. Add imports in main.ts for new helpers (non-breaking)
3. In renderList, replace card creation with `createItemCard()` where easy
4. Replace meta/time rendering with helpers
5. Replace pin/actions rendering with helpers
6. Move content rendering to content.ts incrementally
7. Extract more logic, build/test often

### Step 5: Migrate filter/tabs
- [x] Extract tab rendering/logic to `src/ui/render/tabs.ts`
- [ ] Use in main.ts (replace inline tab class toggling)

### Step 6: Migrate events
- [x] Move event bindings to `src/ui/events.ts` where possible
- [ ] Integrate tab/settings event bindings

### Step 7: State integration
- [x] Introduce `src/state/store.ts` for shared state
- [ ] Migrate globals (history, filteredHistory, currentFilter, selectedIndex) to store gradually
- [ ] Update UI modules to read from store

### Step 8: Thin main.ts
- [ ] `main.ts` should only initialize, wire modules, setup listeners
- [ ] Target < 200 lines

## Execution Rules
- Build after every change
- Test manually for affected features
- Commit small chunks
- Keep backwards compatible
- Don't break shortcuts/actions
