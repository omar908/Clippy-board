/** Density affects main-window chrome and cards; full-content previews keep their sizing. */
export function applyDensity(compact = false) {
  document.documentElement.classList.toggle("density-compact", compact);
}
