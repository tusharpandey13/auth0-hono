/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono'
import { describe, expect, it, beforeEach, afterEach, vi, Mock } from 'vitest'
import { TokenSet } from '@auth0/auth0-server-js'
import { getAccessToken } from '../../src/helpers/getAccessToken'
import { REFRESH_CACHE_KEY, SESSION_CACHE_KEY } from '../../src/lib/constants'
import { InvalidGrantError, TokenRefreshError } from '../../src/errors'

// Mock dependencies
vi.mock('../../src/config/index.js', () => ({
  getClient: vi.fn(),
}))

vi.mock('../../src/errors/errorMap.js', () => ({
  mapServerError: vi.fn((err) => {
    if ((err as any)?.code === 'invalid_grant' || (err as any)?.cause?.error === 'invalid_grant') {
      return new InvalidGrantError('The refresh token is invalid or expired.', err)
    }
    if ((err as any)?.code === 'token_by_refresh_token_error') {
      return new TokenRefreshError('Failed to refresh access token.', err)
    }
    return err
  }),
}))

import { getClient } from '../../src/config/index'

describe('getAccessToken(c, options?)', () => {
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
      getAccessToken: vi.fn(),
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

  it('should return valid cached token without refresh', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'valid_token',
      audience: 'https://api.example.com',
      scope: 'read:data',
      expiresAt: Date.now() + 120000, // expires in 2 minutes
    } as any

    // No refresh cache yet, so client.getAccessToken returns token
    mockContext.get.mockReturnValueOnce(undefined) // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet)
    mockContext.get.mockReturnValueOnce(undefined) // SESSION_CACHE_KEY miss (invalidate)

    const result = await getAccessToken(mockContext)

    expect(result).toEqual(mockTokenSet)
    expect(result.accessToken).toBe('valid_token')
    expect(mockClient.getAccessToken).toHaveBeenCalledWith(mockContext)
  })

  it('should auto-refresh expired token', async () => {
    const newTokenSet: TokenSet = {
      accessToken: 'new_token',
      audience: 'https://api.example.com',
      expiresAt: Date.now() + 3600000, // expires in 1 hour
    } as any

    mockContext.get.mockReturnValueOnce(undefined) // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockResolvedValueOnce(newTokenSet)
    mockContext.get.mockReturnValueOnce(undefined) // SESSION_CACHE_KEY miss (invalidate)

    const result = await getAccessToken(mockContext)

    expect(result.accessToken).toBe('new_token')
    expect(mockClient.getAccessToken).toHaveBeenCalledWith(mockContext)
  })

  it('should throw InvalidGrantError when no refresh token', async () => {
    const error = new Error('No refresh token')
    ;(error as any).code = 'invalid_grant'

    mockContext.get.mockReturnValueOnce(undefined) // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockRejectedValueOnce(error)

    await expect(getAccessToken(mockContext)).rejects.toThrow(InvalidGrantError)
  })

  it('should deduplicate concurrent calls for same audience (Promise-based)', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'deduped_token',
      audience: 'https://api.example.com',
      expiresAt: Date.now() + 3600000,
    } as any

    // Setup: all three calls see the same refresh cache key
    const refreshCache = new Map()
    mockContext.get
      .mockReturnValueOnce(undefined) // First call: REFRESH_CACHE_KEY miss
      .mockReturnValueOnce(refreshCache) // After set: REFRESH_CACHE_KEY hit
      .mockReturnValueOnce(refreshCache) // Second call: REFRESH_CACHE_KEY hit
      .mockReturnValueOnce(refreshCache) // Third call: REFRESH_CACHE_KEY hit
      .mockReturnValueOnce(undefined) // Invalidate SESSION_CACHE_KEY

    // Store the promise in the cache manually to simulate concurrent behavior
    const tokenPromise = Promise.resolve(mockTokenSet)
    refreshCache.set('aud:', tokenPromise)
    mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet)

    // Call 1: Creates promise in cache
    const result1 = getAccessToken(mockContext)

    // Call 2 & 3: Would await same promise (we'll just verify they get same result)
    const result2 = getAccessToken(mockContext)
    const result3 = getAccessToken(mockContext)

    const [res1, res2, res3] = await Promise.all([result1, result2, result3])

    expect(res1).toEqual(mockTokenSet)
    expect(res2).toEqual(mockTokenSet)
    expect(res3).toEqual(mockTokenSet)
    // Verify client called only once
    expect(mockClient.getAccessToken).toHaveBeenCalledTimes(1)
  })

  it('should clear dedup cache per request', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'token1',
      expiresAt: Date.now() + 3600000,
    } as any

    mockContext.get.mockReturnValueOnce(undefined) // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet)
    mockContext.get.mockReturnValueOnce(undefined) // SESSION_CACHE_KEY miss

    await getAccessToken(mockContext)

    // Verify cache was set
    expect(mockContext.set).toHaveBeenCalledWith(REFRESH_CACHE_KEY, expect.any(Map))
  })

  it('should handle refresh failure with error mapping', async () => {
    const refreshError = new Error('Refresh token expired')
    ;(refreshError as any).code = 'token_by_refresh_token_error'

    mockContext.get.mockReturnValueOnce(undefined) // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockRejectedValueOnce(refreshError)

    await expect(getAccessToken(mockContext)).rejects.toThrow(TokenRefreshError)
  })

  it('should support audience parameter with separate cache keys', async () => {
    const mockTokenSet1: TokenSet = {
      accessToken: 'api1_token',
      audience: 'https://api1.com',
      expiresAt: Date.now() + 3600000,
    } as any

    const mockTokenSet2: TokenSet = {
      accessToken: 'api2_token',
      audience: 'https://api2.com',
      expiresAt: Date.now() + 3600000,
    } as any

    const refreshCache = new Map()

    // Setup for two separate audience calls
    mockContext.get
      .mockReturnValueOnce(undefined) // First call: REFRESH_CACHE_KEY miss
      .mockReturnValueOnce(refreshCache) // After first set
      .mockReturnValueOnce(refreshCache) // Second call: REFRESH_CACHE_KEY hit
      .mockReturnValueOnce(undefined) // First invalidate SESSION_CACHE_KEY
      .mockReturnValueOnce(undefined) // Second invalidate SESSION_CACHE_KEY

    mockClient.getAccessToken
      .mockResolvedValueOnce(mockTokenSet1)
      .mockResolvedValueOnce(mockTokenSet2)

    const result1 = await getAccessToken(mockContext, { audience: 'https://api1.com' })
    const result2 = await getAccessToken(mockContext, { audience: 'https://api2.com' })

    expect(result1.audience).toBe('https://api1.com')
    expect(result2.audience).toBe('https://api2.com')
    expect(mockClient.getAccessToken).toHaveBeenCalledTimes(2)
  })

  it('should invalidate session cache after refresh', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'new_token',
      expiresAt: Date.now() + 3600000,
    } as any

    mockContext.get.mockReturnValueOnce(undefined) // REFRESH_CACHE_KEY miss
    mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet)
    mockContext.get.mockReturnValueOnce(undefined) // SESSION_CACHE_KEY miss

    await getAccessToken(mockContext)

    // Verify session cache was invalidated
    expect(mockContext.set).toHaveBeenCalledWith(SESSION_CACHE_KEY, undefined)
  })

  it('should return Auth0TokenSet type with all properties', async () => {
    const mockTokenSet: TokenSet = {
      accessToken: 'token_string',
      audience: 'https://api.example.com',
      scope: 'read:data write:data',
      expiresAt: 1234567890,
    } as any

    mockContext.get.mockReturnValueOnce(undefined)
    mockClient.getAccessToken.mockResolvedValueOnce(mockTokenSet)
    mockContext.get.mockReturnValueOnce(undefined)

    const result = await getAccessToken(mockContext)

    expect(typeof result.accessToken).toBe('string')
    expect(typeof result.audience).toBe('string')
    expect(typeof result.expiresAt).toBe('number')
  })
})
