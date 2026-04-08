/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono'
import { describe, expect, it, beforeEach, afterEach, vi, Mock } from 'vitest'
import { SessionData } from '@auth0/auth0-server-js'
import { updateSession } from '../../src/helpers/updateSession'
import { MissingSessionError } from '../../src/errors'
import { SESSION_CACHE_KEY } from '../../src/lib/constants'

// Mock dependencies
vi.mock('../../src/config/index.js', () => ({
  getClient: vi.fn(),
}))

vi.mock('../../src/helpers/sessionCache.js', () => {
  const actual = vi.importActual('../../src/helpers/sessionCache.js')
  return {
    ...actual,
    getCachedSession: vi.fn(),
  }
})

vi.mock('../../src/helpers/persistSession.js', () => ({
  persistSession: vi.fn(),
}))

import { getCachedSession } from '../../src/helpers/sessionCache'
import { persistSession } from '../../src/helpers/persistSession'

describe('updateSession(c, data)', () => {
  let mockContext: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock context
    mockContext = {
      var: { auth0Configuration: { session: { cookie: { name: 'appSession' } } } },
      get: vi.fn(),
      set: vi.fn(),
    } as any as Context
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should merge data into existing session', async () => {
    const existingSession: SessionData = {
      user: { sub: 'user123', email: 'test@example.com' },
      idToken: 'id_token',
      refreshToken: 'refresh_token',
      tokenSets: [],
      connectionTokenSets: {},
      internal: { sid: 'session_id', createdAt: Date.now() },
      custom1: 'old_value',
    } as any

    ;(getCachedSession as Mock).mockResolvedValueOnce(existingSession)

    await updateSession(mockContext, {
      custom1: 'new_value',
      custom2: 'added_value',
    })

    // Verify persistSession was called with merged data
    expect(persistSession).toHaveBeenCalledWith(mockContext, {
      ...existingSession,
      custom1: 'new_value',
      custom2: 'added_value',
    })

    // Verify context was updated
    expect(mockContext.set).toHaveBeenCalledWith(
      SESSION_CACHE_KEY,
      expect.objectContaining({
        custom1: 'new_value',
        custom2: 'added_value',
      })
    )
  })

  it('should filter reserved fields', async () => {
    const existingSession: SessionData = {
      user: { sub: 'user123' },
      idToken: 'id_token',
      refreshToken: 'refresh_token',
      tokenSets: [],
      connectionTokenSets: {},
      internal: { sid: 'session_id', createdAt: Date.now() },
      permissions: 'user',
    } as any

    ;(getCachedSession as Mock).mockResolvedValueOnce(existingSession)

    // Try to override reserved fields
    await updateSession(mockContext, {
      user: 'hacker',
      idToken: 'fake_token',
      refreshToken: 'fake_refresh',
      tokenSets: [],
      connectionTokenSets: {},
      internal: 'fake_internal',
      permissions: 'admin',
    })

    // Verify only non-reserved fields were merged
    expect(persistSession).toHaveBeenCalledWith(
      mockContext,
      expect.objectContaining({
        user: existingSession.user, // Original preserved
        idToken: existingSession.idToken, // Original preserved
        refreshToken: existingSession.refreshToken, // Original preserved
        tokenSets: existingSession.tokenSets, // Original preserved
        connectionTokenSets: existingSession.connectionTokenSets, // Original preserved
        internal: existingSession.internal, // Original preserved
        permissions: 'admin', // Custom field allowed
      })
    )
  })

  it('should throw MissingSessionError when no session', async () => {
    ;(getCachedSession as Mock).mockResolvedValueOnce(null)

    await expect(updateSession(mockContext, { foo: 'bar' })).rejects.toThrow(
      MissingSessionError
    )
  })

  it('should persist via retained stateStore and update c.var.auth0', async () => {
    const existingSession: SessionData = {
      user: {
        sub: 'user123',
        email: 'test@example.com',
        org_id: 'org_123',
        org_name: 'Test Org',
      },
      idToken: 'id_token',
      refreshToken: 'refresh_token',
      tokenSets: [],
      connectionTokenSets: {},
      internal: { sid: 'session_id', createdAt: Date.now() },
    } as any

    ;(getCachedSession as Mock).mockResolvedValueOnce(existingSession)

    await updateSession(mockContext, { pref: 'dark' })

    // Verify persistSession called with identifier and session
    expect(persistSession).toHaveBeenCalledWith(
      mockContext,
      expect.objectContaining({
        pref: 'dark',
        internal: existingSession.internal, // Preserved
      })
    )

    // Verify c.var.auth0 updated with user and org
    expect(mockContext.set).toHaveBeenCalledWith(
      'auth0',
      expect.objectContaining({
        user: existingSession.user,
        org: {
          id: 'org_123',
          name: 'Test Org',
        },
      })
    )
  })

  it('should preserve RESERVED_FIELDS during merge', async () => {
    const existingSession: SessionData = {
      user: { sub: 'user123' },
      idToken: 'original_id_token',
      refreshToken: 'original_refresh_token',
      tokenSets: [{ accessToken: 'token1' }],
      connectionTokenSets: { 'connection1': { accessToken: 'conn_token' } },
      internal: { sid: 'session_id', createdAt: 1000000 },
    } as any

    ;(getCachedSession as Mock).mockResolvedValueOnce(existingSession)

    await updateSession(mockContext, {
      user: 'should_be_ignored',
      idToken: 'should_be_ignored',
      refreshToken: 'should_be_ignored',
      tokenSets: [],
      connectionTokenSets: {},
      internal: 'should_be_ignored',
      customField: 'custom_value',
    })

    const persistCall = (persistSession as Mock).mock.calls[0][1]

    // Verify reserved fields were not overwritten
    expect(persistCall.user).toBe(existingSession.user)
    expect(persistCall.idToken).toBe(existingSession.idToken)
    expect(persistCall.refreshToken).toBe(existingSession.refreshToken)
    expect(persistCall.internal).toBe(existingSession.internal)

    // Verify custom field was added
    expect(persistCall.customField).toBe('custom_value')
  })
})
