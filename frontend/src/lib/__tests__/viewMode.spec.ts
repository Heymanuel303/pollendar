import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getViewMode, saveViewMode } from '../viewMode'

const TOKEN = 'abc123'
const KEY = `pollendar:vm:${TOKEN}`

describe('viewMode', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  describe('getViewMode', () => {
    it('returns null when nothing is stored', () => {
      expect(getViewMode(TOKEN)).toBeNull()
    })

    it('returns the stored value when it is a valid mode', () => {
      localStorage.setItem(KEY, 'vote')
      expect(getViewMode(TOKEN)).toBe('vote')
      localStorage.setItem(KEY, 'results')
      expect(getViewMode(TOKEN)).toBe('results')
    })

    it('falls back to null for any stale / garbage value', () => {
      localStorage.setItem(KEY, 'matrix')
      expect(getViewMode(TOKEN)).toBeNull()
      localStorage.setItem(KEY, '')
      expect(getViewMode(TOKEN)).toBeNull()
    })

    it('namespaces per poll token', () => {
      localStorage.setItem('pollendar:vm:other', 'results')
      expect(getViewMode(TOKEN)).toBeNull()
    })

    it('returns null (never throws) when storage access throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })
      expect(getViewMode(TOKEN)).toBeNull()
    })
  })

  describe('saveViewMode', () => {
    it('persists the chosen mode under the per-poll key', () => {
      saveViewMode(TOKEN, 'results')
      expect(localStorage.getItem(KEY)).toBe('results')
      saveViewMode(TOKEN, 'vote')
      expect(localStorage.getItem(KEY)).toBe('vote')
    })

    it('round-trips through getViewMode', () => {
      saveViewMode(TOKEN, 'results')
      expect(getViewMode(TOKEN)).toBe('results')
    })

    it('silently no-ops (never throws) when storage access throws', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage disabled')
      })
      expect(() => saveViewMode(TOKEN, 'vote')).not.toThrow()
    })
  })
})
