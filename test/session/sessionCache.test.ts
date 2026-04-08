/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono'
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { getCachedSession, invalidateSessionCache } from '../../src/helpers/sessionCache'
import { SESSION_CACHE_KEY } from '../../src/lib/constants'
import { getClient } from '../../src/config/index'

// Mock config module
vi.mock('../../src/config/index', () => ({
  getClient: vi.fn(),
}))

describe('Session Cache Helpers', () => {
  let mockContext: Context
  let mockClient: any
  let mockSession: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockSession = {
      user: { sub: 'user123', email: 'test@example.com' },
      idToken: 'eyJhbGc...',
      refreshToken: 'refresh_token_123',
      tokenSets: [],
      custom: 'field',
    }

    mockClient = {
      getSession: vi.fn().mockResolvedValue(mockSession),
    }

    mockContext = {
      var: {},
      set: function (key: string, value: any) {
        this.var[key] = value
        return value
      },
      get: function (key: string) {
        return this.var[key]
      },
    } as any

    ;(getClient as any).mockReturnValue({ client: mockClient })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getCachedSession', () => {
    it('should return cached session if available', async () => {
      // Pre-populate cache
      mockContext.set(SESSION_CACHE_KEY, mockSession)

      const result = await getCachedSession(mockContext)

      expect(result).toEqual(mockSession)
      // Client should not be called
      expect(mockClient.getSession).not.toHaveBeenCalled()
    })

    it('should call client if not cached', async () => {
      const result = await getCachedSession(mockContext)

      expect(result).toEqual(mockSession)
      expect(mockClient.getSession).toHaveBeenCalledWith(mockContext)
    })

    it('should cache session after client call', async () => {
      await getCachedSession(mockContext)

      const cached = mockContext.get(SESSION_CACHE_KEY)
      expect(cached).toEqual(mockSession)
    })

    it('should cache null when no session', async () => {
      mockClient.getSession.mockResolvedValue(null)

      const result = await getCachedSession(mockContext)

      expect(result).toBeNull()
      const cached = mockContext.get(SESSION_CACHE_KEY)
      expect(cached).toBeNull()
    })

    it('should return null on second call after null cached', async () => {
      mockClient.getSession.mockResolvedValue(null)

      // First call
      await getCachedSession(mockContext)
      expect(mockClient.getSession).toHaveBeenCalledTimes(1)

      // Second call should use cache
      const result = await getCachedSession(mockContext)
      expect(result).toBeNull()
      expect(mockClient.getSession).toHaveBeenCalledTimes(1) // No additional call
    })

    it('should include custom fields from session', async () => {
      mockClient.getSession.mockResolvedValue({
        ...mockSession,
        permissions: ['read', 'write'],
        userId: 12345,
      })

      const result = await getCachedSession(mockContext)

      expect(result.permissions).toEqual(['read', 'write'])
      expect(result.userId).toBe(12345)
    })

    it('should not propagate client errors to cache', async () => {
      const error = new Error('Client error')
      mockClient.getSession.mockRejectedValue(error)

      await expect(getCachedSession(mockContext)).rejects.toThrow('Client error')
      // Cache should be empty
      expect(mockContext.get(SESSION_CACHE_KEY)).toBeUndefined()
    })

    it('should allow retry after client error', async () => {
      const error = new Error('Client error')
      mockClient.getSession.mockRejectedValueOnce(error)
      mockClient.getSession.mockResolvedValueOnce(mockSession)

      // First call fails
      await expect(getCachedSession(mockContext)).rejects.toThrow('Client error')

      // Second call succeeds
      const result = await getCachedSession(mockContext)
      expect(result).toEqual(mockSession)
      expect(mockClient.getSession).toHaveBeenCalledTimes(2)
    })
  })

  describe('invalidateSessionCache', () => {
    it('should clear cached session', () => {
      mockContext.set(SESSION_CACHE_KEY, mockSession)

      invalidateSessionCache(mockContext)

      expect(mockContext.get(SESSION_CACHE_KEY)).toBeUndefined()
    })

    it('should allow fresh load on next getCachedSession call', async () => {
      // Pre-populate cache
      mockContext.set(SESSION_CACHE_KEY, {
        user: { sub: 'old_user' },
      })

      invalidateSessionCache(mockContext)

      // Reset mock call count
      mockClient.getSession.mockClear()
      mockClient.getSession.mockResolvedValue(mockSession)

      const result = await getCachedSession(mockContext)

      expect(result).toEqual(mockSession)
      expect(mockClient.getSession).toHaveBeenCalledOnce()
    })

    it('should be idempotent (calling twice is safe)', () => {
      mockContext.set(SESSION_CACHE_KEY, mockSession)

      invalidateSessionCache(mockContext)
      invalidateSessionCache(mockContext)

      expect(mockContext.get(SESSION_CACHE_KEY)).toBeUndefined()
    })
  })

  describe('cache behavior in request lifecycle', () => {
    it('should cache within single request', async () => {
      const result1 = await getCachedSession(mockContext)
      const result2 = await getCachedSession(mockContext)

      expect(result1).toEqual(result2)
      expect(mockClient.getSession).toHaveBeenCalledOnce()
    })

    it('should not cache across requests', async () => {
      // First request
      const ctx1 = { ...mockContext } as any
      ctx1.var = {}
      ctx1.set = function (key: string, value: any) {
        this.var[key] = value
        return value
      }
      ctx1.get = function (key: string) {
        return this.var[key]
      }

      await getCachedSession(ctx1)

      // Second request (new context)
      const ctx2 = { ...mockContext } as any
      ctx2.var = {}
      ctx2.set = function (key: string, value: any) {
        this.var[key] = value
        return value
      }
      ctx2.get = function (key: string) {
        return this.var[key]
      }

      mockClient.getSession.mockClear()
      mockClient.getSession.mockResolvedValue(mockSession)

      await getCachedSession(ctx2)

      // Both requests should call getSession
      expect(mockClient.getSession).toHaveBeenCalledTimes(1)
    })

    it('should handle invalidation during request', async () => {
      // Load session
      const result1 = await getCachedSession(mockContext)
      expect(result1).toEqual(mockSession)

      // Invalidate
      invalidateSessionCache(mockContext)

      // Mock returns updated session
      const updatedSession = { ...mockSession, user: { sub: 'user_updated' } }
      mockClient.getSession.mockResolvedValue(updatedSession)

      // Load again
      const result2 = await getCachedSession(mockContext)
      expect(result2.user.sub).toBe('user_updated')
    })
  })

  describe('edge cases', () => {
    it('should distinguish between undefined and null cache values', async () => {
      // Explicitly cache null (no session)
      mockContext.set(SESSION_CACHE_KEY, null)

      const result = await getCachedSession(mockContext)

      expect(result).toBeNull()
      expect(mockClient.getSession).not.toHaveBeenCalled()
    })

    it('should handle empty session object', async () => {
      mockClient.getSession.mockResolvedValue({})

      const result = await getCachedSession(mockContext)

      expect(result).toEqual({})
    })

    it('should cache large session objects', async () => {
      const largeSession = {
        ...mockSession,
        tokenSets: Array(100)
          .fill(null)
          .map((_, i) => ({ audience: `aud${i}`, token: `token${i}` })),
      }
      mockClient.getSession.mockResolvedValue(largeSession)

      const result = await getCachedSession(mockContext)

      expect(result.tokenSets.length).toBe(100)
      const cached = mockContext.get(SESSION_CACHE_KEY)
      expect(cached.tokenSets.length).toBe(100)
    })
  })
})
