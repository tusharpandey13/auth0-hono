/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'hono'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { getUser } from '../../src/helpers/getUser'
import { MissingSessionError } from '../../src/errors'

describe('getUser(c)', () => {
  let mockContext: any

  beforeEach(() => {
    vi.clearAllMocks()

    mockContext = {
      var: { auth0: {} },
    } as any as Context
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return user from c.var.auth0.user (synchronous)', () => {
    const mockUser = {
      sub: 'user123',
      email: 'test@example.com',
      name: 'Test User',
    }

    mockContext.var.auth0.user = mockUser

    const result = getUser(mockContext)

    expect(result).toEqual(mockUser)
    expect(result.email).toBe('test@example.com')
  })

  it('should throw MissingSessionError when no user', () => {
    mockContext.var.auth0.user = null

    expect(() => getUser(mockContext)).toThrow(MissingSessionError)

    // Verify the error description mentions the issue
    try {
      getUser(mockContext)
    } catch (err) {
      expect((err as any).description).toContain('getUser() called on an unauthenticated request')
    }
  })

  it('should throw MissingSessionError when called on plain Context (c.var.auth0 undefined)', () => {
    mockContext.var.auth0 = undefined

    expect(() => getUser(mockContext)).toThrow(MissingSessionError)
  })

  it('should work after requiresAuth() middleware (user guaranteed)', () => {
    const mockUser = {
      sub: 'authenticated_user',
      email: 'auth@example.com',
      org_id: 'org_123',
    }

    // Simulate state after requiresAuth() middleware
    mockContext.var.auth0.user = mockUser

    const result = getUser(mockContext)

    expect(result).toEqual(mockUser)
    expect(result.org_id).toBe('org_123')
  })
})
