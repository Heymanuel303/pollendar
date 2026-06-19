/**
 * Persist the creator's chosen candidate-times editor view — `Calendar` (month-grid multi-select)
 * vs `List` (per-date `DateCard` override surface) — so a returning creator reopens the editor in
 * the view they last used. Keyed app-wide under `pollendar:editor-view`.
 *
 * Every access is wrapped in try/catch: private-mode browsers and storage-disabled environments
 * throw on `localStorage`, and the editor must still render even if we cannot remember the choice.
 * A read failure (or any stale/garbage value) is treated as "no preference stored" — the caller
 * then falls back to the breakpoint default (Calendar on phone, List on desktop). The strict
 * `=== 'calendar' || === 'list'` guard means no invalid value can ever reach the template.
 */

export type EditorView = 'calendar' | 'list'

const KEY = 'pollendar:editor-view'

/** Read the stored editor view, or `null` if none/invalid is stored (or storage is unavailable). */
export function getEditorView(): EditorView | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'calendar' || v === 'list' ? v : null
  } catch {
    return null
  }
}

/** Persist the chosen editor view. Silently no-ops if storage is unavailable. */
export function saveEditorView(view: EditorView): void {
  try {
    localStorage.setItem(KEY, view)
  } catch {
    // Storage disabled — the preference just isn't remembered next time.
  }
}
