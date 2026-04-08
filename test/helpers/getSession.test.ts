/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono'
import { describe, expect, it, beforeEach, afterEach, vi, Mock } from 'vitest'
import { SessionData } from '@auth0/auth0-server-js'
import { getSession } from '../../src/helpers/getSession'
import { SESSION_CACHE_KEY } from '../../src/lib/constants'

// Mock dependencies
vi.mock('../../src/config/index.js', () => ({
  getClient: vi.fn(),
}))

import { getClient } from '../../src/config/index'

describe('getSession(c)', () => {
  let mockContext: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock context with get/set methods
    mockContext = {
      var: { auth0: {} },
      get: vi.fn(),
      set: vi.fn(),
    } as any as Context

    // Create mock client
    mockClient = {
      getSession: vi.fn(),
    }

    // Setup getClient mock
    ;(getClient as Mock).mockReturnValue({
      client: mockClient,
      configuration: {},
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return full session on authenticated request', async () => {
    const mockSessionData: SessionData = {
      user: { sub: 'user123', email: 'test@example.com' },
      idToken: 'id_token_jwt',
      refreshToken: 'refresh_token',
      tokenSets: [],
      connectionTokenSets: {},
      internal: { sid: 'session_id', createdAt: Date.now() },
      custom: 'data',
    } as any

    // First call returns undefined (cache miss), second call returns session
    mockContext.get.mockReturnValueOnce(undefined)
    mockClient.getSession.mockResolvedValueOnce(mockSessionData)
    mockContext.get.mockReturnValueOnce(mockSessionData)

    const result = await getSession(mockContext)

    expect(result).toEqual(mockSessionData)
    expect(result?.custom).toBe('data')
    expect(mockClient.getSession).toHaveBeenCalledWith(mockContext)
  })

  it('should return null on unauthenticated request', async () => {
    // Cache miss → client returns null
    mockContext.get.mockReturnValueOnce(undefined)
    mockClient.getSession.mockResolvedValueOnce(null)

    const result = await getSession(mockContext)

    expect(result).toBeNull()
  })

  it('should use request-scoped cache (second call uses cache)', async () => {
    const mockSessionData: SessionData = {
      user: { sub: 'user123' },
    } as any

    let callCount = 0
    mockContext.get.mockImplementation((key: string) => {
      // First call: cache miss (undefined)
      // After first call, set is called which would store the value
      // Second call: cache hit (return the session)
      if (key === SESSION_CACHE_KEY) {
        if (callCount === 0) {
          callCount++
          return undefined // Cache miss
        }
        return mockSessionData // Cache hit
      }
      return undefined
    })

    mockClient.getSession.mockResolvedValueOnce(mockSessionData)

    // First call: cache miss
    const result1 = await getSession(mockContext)
    expect(mockClient.getSession).toHaveBeenCalledTimes(1)

    // Second call: cache hit (no client call)
    const result2 = await getSession(mockContext)

    expect(result1).toEqual(mockSessionData)
    expect(result2).toEqual(mockSessionData)
    // Verify client was only called once despite two getSession calls
    expect(mockClient.getSession).toHaveBeenCalledTimes(1)
  })

  it('should work with stateless store (encrypted cookie)', async () => {
    const mockSessionData: SessionData = {
      user: { sub: 'user123' },
    } as any

    mockContext.get.mockReturnValueOnce(undefined)
    mockClient.getSession.mockResolvedValueOnce(mockSessionData)

    const result = await getSession(mockContext)

    expect(result).toEqual(mockSessionData)
    expect(mockContext.set).toHaveBeenCalledWith(SESSION_CACHE_KEY, mockSessionData)
  })

  it('should propagate errors mapped via mapServerError', async () => {
    const serverError = new Error('Session store error')
    ;(serverError as any).code = 'missing_session_error'

    mockContext.get.mockReturnValueOnce(undefined)
    mockClient.getSession.mockRejectedValueOnce(serverError)

    // We expect the error to be caught and handled
    // Since getSession calls getCachedSession which calls client.getSession,
    // errors propagate through
    await expect(getSession(mockContext)).rejects.toThrow()
  })
})
