/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono'
import { describe, expect, it, beforeEach, afterEach, vi, Mock } from 'vitest'
import { ConnectionTokenSet } from '@auth0/auth0-server-js'
import { getAccessTokenForConnection } from '../../src/helpers/getAccessTokenForConnection'
import { ConnectionTokenError } from '../../src/errors'

// Mock dependencies
vi.mock('../../src/config/index.js', () => ({
  getClient: vi.fn(),
}))

vi.mock('../../src/errors/errorMap.js', () => ({
  mapServerError: vi.fn((err) => {
    if ((err as any)?.code === 'token_for_connection_error') {
      return new ConnectionTokenError('Failed to get token for connection.', err)
    }
    return err
  }),
}))

import { getClient } from '../../src/config/index'

describe('getAccessTokenForConnection(c, options)', () => {
  let mockContext: any
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock context
    mockContext = {
      var: { auth0: {} },
      get: vi.fn(),
      set: vi.fn(),
    } as any as Context

    // Create mock client
    mockClient = {
      getAccessTokenForConnection: vi.fn(),
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

  it('should return connection token for specified connection', async () => {
    const mockTokenSet: ConnectionTokenSet = {
      accessToken: 'google_access_token',
      scope: 'https://www.googleapis.com/auth/userinfo.email',
    } as any

    mockClient.getAccessTokenForConnection.mockResolvedValueOnce(mockTokenSet)

    const result = await getAccessTokenForConnection(mockContext, {
      connection: 'google-oauth2',
      loginHint: 'user@gmail.com',
    })

    expect(result).toEqual(mockTokenSet)
    expect(result.accessToken).toBe('google_access_token')
    expect(mockClient.getAccessTokenForConnection).toHaveBeenCalledWith(
      { connection: 'google-oauth2', loginHint: 'user@gmail.com' },
      mockContext
    )
  })

  it('should map connection token error', async () => {
    const error = new Error('Connection unavailable')
    ;(error as any).code = 'token_for_connection_error'

    mockClient.getAccessTokenForConnection.mockRejectedValueOnce(error)

    await expect(
      getAccessTokenForConnection(mockContext, {
        connection: 'google-oauth2',
      })
    ).rejects.toThrow(ConnectionTokenError)
  })

  it('should not cache/deduplicate (each call hits client)', async () => {
    const mockTokenSet: ConnectionTokenSet = {
      accessToken: 'connection_token',
      scope: 'scope1',
    } as any

    mockClient.getAccessTokenForConnection.mockResolvedValue(mockTokenSet)

    // Call twice
    const result1 = await getAccessTokenForConnection(mockContext, {
      connection: 'github',
    })

    const result2 = await getAccessTokenForConnection(mockContext, {
      connection: 'github',
    })

    // Both should have independent results
    expect(result1).toEqual(mockTokenSet)
    expect(result2).toEqual(mockTokenSet)

    // Client should be called twice (no caching)
    expect(mockClient.getAccessTokenForConnection).toHaveBeenCalledTimes(2)
  })
})
