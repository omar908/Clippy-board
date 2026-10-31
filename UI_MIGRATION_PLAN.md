# UI Migration Plan (Incremental)

## Goal
Migrate all UI rendering logic from `main.ts` into modular `src/ui/` modules without breaking functionality. Follow strangler pattern.

## Current State
- `main.ts` has `renderList()` (~300+ lines), `updateCounts()`, `filterAndRender()`, event bindings, etc.
- Created `src/ui/dom.ts`, `src/ui/render/list.ts` (skeleton)
- Core logic (API/actions/shortcuts) already modularized

## Incremental Plan

### Step 1: Extract DOM utilities
- [ ] Expand `src/ui/dom.ts` with helpers (createElement with attrs, classes)
- [ ] Replace direct `getElementById` in main.ts gradually
- [ ] Test build

### Step 2: Extract formatting/utils
- [ ] Move `formatTime()`, `formatTTL()` to `src/utils/format.ts`
- [ ] Move key normalization if needed to `src/utils/keys.ts`
- [ ] Update imports in main.ts
- [ ] Test

### Step 3: Create render modules
- [ ] `src/ui/render/header.ts` - header actions, counts
- [ ] `src/ui/render/settings.ts` - settings page rendering
- [ ] `src/ui/render/empty.ts` - empty state
- [ ] Migrate small render functions first

### Step 4: Migrate renderList incrementally
- [ ] Move item creation helpers to `src/ui/render/item.ts`
- [ ] Move meta/badge/time rendering
- [ ] Move content rendering by type (text/image/file)
- [ ] Move actions row rendering
- [ ] Keep `renderList()` in main.ts as thin wrapper calling modules
- [ ] Test after each sub-step

### Step 5: Migrate filter/tabs
- [ ] Extract tab rendering/logic to `src/ui/render/tabs.ts`
- [ ] Use in main.ts

### Step 6: Migrate events
- [ ] Move event bindings to `src/ui/events.ts` where possible
- [ ] Keep minimal wiring in main.ts

### Step 7: State integration
- [ ] Introduce `src/state/store.ts` for shared state
- [ ] Migrate globals (history, filteredHistory, etc.) to store
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
