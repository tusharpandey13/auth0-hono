/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono'
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { persistSession } from '../../src/helpers/persistSession'
import { STATE_STORE_KEY } from '../../src/lib/constants'

describe('persistSession Helper', () => {
  let mockContext: Context
  let mockStateStore: any
  let mockConfig: any
  let mockSession: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockSession = {
      user: { sub: 'user123', email: 'test@example.com' },
      idToken: 'eyJhbGc...',
      refreshToken: 'refresh_token_123',
      tokenSets: [
        {
          accessToken: 'access_token_123',
          audience: 'https://api.example.com',
          scope: 'openid profile email',
          expiresAt: Date.now() + 3600000,
        },
      ],
      internal: {
        sid: 'session_123',
        createdAt: 1234567890,
      },
      custom: 'field',
    }

    mockStateStore = {
      set: vi.fn().mockResolvedValue(undefined),
    }

    mockConfig = {
      session: {
        cookie: {
          name: 'appSession',
        },
      },
    }

    mockContext = {
      var: {
        auth0Configuration: mockConfig,
      },
      set: function (key: string, value: any) {
        this.var[key] = value
        return value
      },
      get: function (key: string) {
        return this.var[key]
      },
    } as any

    mockContext.set(STATE_STORE_KEY, mockStateStore)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('session persistence', () => {
    it('should write session to state store', async () => {
      await persistSession(mockContext, mockSession)

      expect(mockStateStore.set).toHaveBeenCalledWith(
        'appSession',
        mockSession,
        false,
        mockContext
      )
    })

    it('should use correct identifier from config', async () => {
      mockConfig.session.cookie.name = 'custom_session_name'

      await persistSession(mockContext, mockSession)

      expect(mockStateStore.set).toHaveBeenCalledWith(
        'custom_session_name',
        mockSession,
        false,
        mockContext
      )
    })

    it('should use default identifier when config not set', async () => {
      mockConfig.session.cookie = undefined

      await persistSession(mockContext, mockSession)

      expect(mockStateStore.set).toHaveBeenCalledWith(
        'appSession',
        mockSession,
        false,
        mockContext
      )
    })

    it('should pass deleteSession flag as false', async () => {
      await persistSession(mockContext, mockSession)

      const [, , deleteFlag] = (mockStateStore.set as any).mock.calls[0]
      expect(deleteFlag).toBe(false)
    })

    it('should pass context to state store', async () => {
      await persistSession(mockContext, mockSession)

      const [, , , ctx] = (mockStateStore.set as any).mock.calls[0]
      expect(ctx).toBe(mockContext)
    })
  })

  describe('internal field preservation', () => {
    it('should preserve session.internal during persist', async () => {
      const sessionWithInternal = {
        ...mockSession,
        internal: {
          sid: 'original_sid',
          createdAt: 9876543210,
        },
      }

      await persistSession(mockContext, sessionWithInternal)

      const [, persistedSession] = (mockStateStore.set as any).mock.calls[0]
      expect(persistedSession.internal).toEqual({
        sid: 'original_sid',
        createdAt: 9876543210,
      })
    })

    it('should handle session without internal field', async () => {
      const sessionWithoutInternal = {
        user: { sub: 'user123' },
        idToken: 'token',
      }

      await persistSession(mockContext, sessionWithoutInternal)

      const [, persistedSession] = (mockStateStore.set as any).mock.calls[0]
      expect(persistedSession).toEqual(sessionWithoutInternal)
    })
  })

  describe('custom field handling', () => {
    it('should preserve custom fields', async () => {
      const sessionWithCustom = {
        ...mockSession,
        custom_field: 'custom_value',
        permissions: ['read', 'write'],
        userId: 12345,
      }

      await persistSession(mockContext, sessionWithCustom)

      const [, persistedSession] = (mockStateStore.set as any).mock.calls[0]
      expect(persistedSession.custom_field).toBe('custom_value')
      expect(persistedSession.permissions).toEqual(['read', 'write'])
      expect(persistedSession.userId).toBe(12345)
    })

    it('should preserve enriched session from onCallback', async () => {
      const enrichedSession = {
        ...mockSession,
        enriched: true,
        metadata: {
          source: 'onCallback',
          timestamp: 1234567890,
        },
      }

      await persistSession(mockContext, enrichedSession)

      const [, persistedSession] = (mockStateStore.set as any).mock.calls[0]
      expect(persistedSession.enriched).toBe(true)
      expect(persistedSession.metadata).toEqual({
        source: 'onCallback',
        timestamp: 1234567890,
      })
    })
  })

  describe('error handling', () => {
    it('should throw when state store not in context', async () => {
      mockContext.set(STATE_STORE_KEY, undefined)

      await expect(persistSession(mockContext, mockSession)).rejects.toThrow()
    })

    it('should throw when configuration not in context', async () => {
      mockContext.var.auth0Configuration = undefined

      await expect(persistSession(mockContext, mockSession)).rejects.toThrow(
        /Auth0 configuration not found/
      )
    })

    it('should propagate state store errors', async () => {
      mockStateStore.set.mockRejectedValue(new Error('Store error'))

      await expect(persistSession(mockContext, mockSession)).rejects.toThrow(
        'Store error'
      )
    })
  })

  describe('identifier matching', () => {
    it('should match cookie name in identifier', async () => {
      mockConfig.session.cookie.name = 'my_session_cookie'

      await persistSession(mockContext, mockSession)

      const [identifier] = (mockStateStore.set as any).mock.calls[0]
      expect(identifier).toBe('my_session_cookie')
    })

    it('should use default when session.cookie undefined', async () => {
      mockConfig.session = { cookie: undefined }

      await persistSession(mockContext, mockSession)

      const [identifier] = (mockStateStore.set as any).mock.calls[0]
      expect(identifier).toBe('appSession')
    })

    it('should use default when session.cookie.name undefined', async () => {
      mockConfig.session.cookie = { name: undefined }

      await persistSession(mockContext, mockSession)

      const [identifier] = (mockStateStore.set as any).mock.calls[0]
      expect(identifier).toBe('appSession')
    })
  })

  describe('stateless vs stateful stores', () => {
    it('should work with stateless store (encrypted cookie)', async () => {
      // Stateless store typically writes to response headers
      const statelessStore = {
        set: vi
          .fn()
          .mockImplementation(async () => {
            // Simulates encrypted cookie in response
            return Promise.resolve()
          }),
      }
      mockContext.set(STATE_STORE_KEY, statelessStore)

      await persistSession(mockContext, mockSession)

      expect(statelessStore.set).toHaveBeenCalledWith(
        'appSession',
        mockSession,
        false,
        mockContext
      )
    })

    it('should work with stateful store (backend storage)', async () => {
      // Stateful store typically writes to Redis/database
      const statefulStore = {
        set: vi
          .fn()
          .mockImplementation(async () => {
            // Simulates backend write
            return Promise.resolve()
          }),
      }
      mockContext.set(STATE_STORE_KEY, statefulStore)

      await persistSession(mockContext, mockSession)

      expect(statefulStore.set).toHaveBeenCalledWith(
        'appSession',
        mockSession,
        false,
        mockContext
      )
    })
  })

  describe('integration', () => {
    it('should handle full session update flow', async () => {
      const originalSession = {
        ...mockSession,
        permissions: ['read'],
      }

      await persistSession(mockContext, originalSession)

      expect(mockStateStore.set).toHaveBeenCalledWith(
        'appSession',
        expect.objectContaining({
          permissions: ['read'],
        }),
        false,
        mockContext
      )

      // Update session with new permissions
      const updatedSession = {
        ...originalSession,
        permissions: ['read', 'write', 'admin'],
      }

      mockStateStore.set.mockClear()
      await persistSession(mockContext, updatedSession)

      expect(mockStateStore.set).toHaveBeenCalledWith(
        'appSession',
        expect.objectContaining({
          permissions: ['read', 'write', 'admin'],
        }),
        false,
        mockContext
      )
    })

    it('should preserve all session fields during update', async () => {
      const originalSession = mockSession

      // First persist
      await persistSession(mockContext, originalSession)

      // Update with new field
      const updatedSession = {
        ...originalSession,
        newField: 'new value',
      }

      mockStateStore.set.mockClear()
      await persistSession(mockContext, updatedSession)

      const [, persistedSession] = (mockStateStore.set as any).mock.calls[0]

      // All original fields should be present
      expect(persistedSession.user).toEqual(originalSession.user)
      expect(persistedSession.idToken).toBe(originalSession.idToken)
      expect(persistedSession.refreshToken).toBe(originalSession.refreshToken)
      expect(persistedSession.tokenSets).toEqual(originalSession.tokenSets)
      expect(persistedSession.internal).toEqual(originalSession.internal)
      expect(persistedSession.newField).toBe('new value')
    })
  })
})
