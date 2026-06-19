import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getEditorView, saveEditorView } from '../editorViewPreference'

const KEY = 'pollendar:editor-view'

describe('editorViewPreference', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('getEditorView', () => {
    it('returns null when nothing is stored', () => {
      expect(getEditorView()).toBeNull()
    })

    it('returns the stored value when it is a valid view', () => {
      localStorage.setItem(KEY, 'calendar')
      expect(getEditorView()).toBe('calendar')
      localStorage.setItem(KEY, 'list')
      expect(getEditorView()).toBe('list')
    })

    it('falls back to null for any stale / garbage value', () => {
      localStorage.setItem(KEY, 'grid')
      expect(getEditorView()).toBeNull()
      localStorage.setItem(KEY, '')
      expect(getEditorView()).toBeNull()
    })

    it('returns null (never throws) when storage access throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })
      expect(getEditorView()).toBeNull()
    })
  })

  describe('saveEditorView', () => {
    it('persists the chosen view under the app-wide key', () => {
      saveEditorView('calendar')
      expect(localStorage.getItem(KEY)).toBe('calendar')
      saveEditorView('list')
      expect(localStorage.getItem(KEY)).toBe('list')
    })

    it('round-trips through getEditorView', () => {
      saveEditorView('calendar')
      expect(getEditorView()).toBe('calendar')
    })

    it('silently no-ops (never throws) when storage access throws', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })
      expect(() => saveEditorView('list')).not.toThrow()
    })
  })
})
