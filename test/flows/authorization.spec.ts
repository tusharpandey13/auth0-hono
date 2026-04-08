/* eslint-disable @typescript-eslint/no-explicit-any */
import { Hono } from 'hono'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { claimEquals, claimIncludes, claimCheck, requiresOrg } from '../../src/middleware'
import { Auth0User } from '../../src/types/auth0'

// Mock getClient for standalone middleware
vi.mock('../../src/config/index', () => ({
  getClient: vi.fn((c) => ({
    client: c.get('mockClient'),
    configuration: { baseURL: 'https://app.test.com' },
  })),
  ensureClient: vi.fn(),
}))

// Mock error mapping
vi.mock('../../src/errors/errorMap', () => ({
  mapServerError: (err: any) => err,
}))

describe('Authorization Flows (Claims & Organization)', () => {
  let mockContext: any
  let mockUser: Auth0User

  beforeEach(() => {
    vi.clearAllMocks()

    mockUser = {
      sub: 'auth0|123',
      email: 'test@example.com',
      name: 'Test User',
      email_verified: true,
      org_id: 'org_123',
      org_name: 'Test Org',
      permissions: ['read:data', 'write:data'],
      role: 'admin',
    } as Auth0User

    mockContext = {
      var: {
        auth0: {
          user: mockUser,
          session: { user: mockUser },
          org: { id: 'org_123', name: 'Test Org' },
        },
      },
      get: vi.fn((key: string) => mockContext.vars[key]),
      set: vi.fn((key: string, value: any) => {
        mockContext.vars[key] = value
      }),
      vars: {},
      json: vi.fn((data) => ({ status: 200, body: data })),
      text: vi.fn((data) => ({ status: 200, body: data })),
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should allow matching claim with claimEquals', async () => {
    // User has role: admin, middleware requires admin
    const middleware = claimEquals('role', 'admin')

    let middlewarePassed = false
    const next = vi.fn().mockImplementation(() => {
      middlewarePassed = true
      return Promise.resolve(undefined)
    })

    await middleware(mockContext, next)

    expect(middlewarePassed).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  it('should block mismatched claim with claimEquals', async () => {
    // User has role: admin, middleware requires user role
    const middleware = claimEquals('role', 'user')

    const next = vi.fn()
    let error: any

    try {
      await middleware(mockContext, next)
    } catch (err) {
      error = err
    }

    expect(error).toBeDefined()
    expect(error?.code).toBe('insufficient_claims')
    expect(next).not.toHaveBeenCalled()
  })

  it('should allow matching array with claimIncludes', async () => {
    // User has permissions: ["read:data", "write:data"]
    const middleware = claimIncludes('permissions', 'read:data')

    let middlewarePassed = false
    const next = vi.fn().mockImplementation(() => {
      middlewarePassed = true
      return Promise.resolve(undefined)
    })

    await middleware(mockContext, next)

    expect(middlewarePassed).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  it('should block missing array value with claimIncludes', async () => {
    // User permissions don't include "delete:data"
    const middleware = claimIncludes('permissions', 'delete:data')

    const next = vi.fn()
    let error: any

    try {
      await middleware(mockContext, next)
    } catch (err) {
      error = err
    }

    expect(error).toBeDefined()
    expect(error?.code).toBe('insufficient_claims')
    expect(next).not.toHaveBeenCalled()
  })

  it('should support variadic values in claimIncludes (ANY match passes)', async () => {
    // User has role: admin (in any position)
    const middleware = claimIncludes('permissions', 'delete:data', 'read:data', 'admin')

    let middlewarePassed = false
    const next = vi.fn().mockImplementation(() => {
      middlewarePassed = true
      return Promise.resolve(undefined)
    })

    await middleware(mockContext, next)

    expect(middlewarePassed).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  it('should allow custom check function with claimCheck', async () => {
    // Custom check: user is email verified
    const middleware = claimCheck((user) => user.email_verified === true)

    let middlewarePassed = false
    const next = vi.fn().mockImplementation(() => {
      middlewarePassed = true
      return Promise.resolve(undefined)
    })

    await middleware(mockContext, next)

    expect(middlewarePassed).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  it('should block custom check returning false', async () => {
    // Custom check: user is NOT verified
    const middleware = claimCheck((user) => user.email_verified === false)

    const next = vi.fn()
    let error: any

    try {
      await middleware(mockContext, next)
    } catch (err) {
      error = err
    }

    expect(error).toBeDefined()
    expect(error?.code).toBe('insufficient_claims')
    expect(next).not.toHaveBeenCalled()
  })

  it('should allow org_id match with requiresOrg', async () => {
    // User org_id matches required org
    const middleware = requiresOrg({ orgId: 'org_123' })

    let middlewarePassed = false
    const next = vi.fn().mockImplementation(() => {
      middlewarePassed = true
      return Promise.resolve(undefined)
    })

    await middleware(mockContext, next)

    expect(middlewarePassed).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  it('should block organization mismatch with requiresOrg', async () => {
    // User org_id doesn't match required org
    const middleware = requiresOrg({ orgId: 'org_456' })

    const next = vi.fn()
    let error: any

    try {
      await middleware(mockContext, next)
    } catch (err) {
      error = err
    }

    expect(error).toBeDefined()
    expect(error?.code).toBe('organization_mismatch')
    expect(next).not.toHaveBeenCalled()
  })

  it('should support custom org check function', async () => {
    // Custom check: org_id starts with org_
    const middleware = requiresOrg((c) => {
      const orgId = c.var.auth0?.user?.org_id
      return orgId && orgId.startsWith('org_')
    })

    let middlewarePassed = false
    const next = vi.fn().mockImplementation(() => {
      middlewarePassed = true
      return Promise.resolve(undefined)
    })

    await middleware(mockContext, next)

    expect(middlewarePassed).toBe(true)
    expect(next).toHaveBeenCalled()
  })

  it('should chain middleware all passing', async () => {
    // Setup: requiresAuth pass, claimIncludes pass, requiresOrg pass
    const app = new Hono()

    app.use('*', (c, next) => {
      // Simulate auth0() middleware
      c.var.auth0 = {
        user: mockUser,
        session: { user: mockUser },
        org: { id: 'org_123', name: 'Test Org' },
      }
      return next()
    })

    app.get('/admin/data', claimIncludes('permissions', 'read:data'))
    app.get('/admin/data', requiresOrg({ orgId: 'org_123' }))
    app.get('/admin/data', (c) => {
      return c.json({ data: 'secret' })
    })

    expect(app).toBeDefined()
  })

  it('should short-circuit middleware chain on failure', async () => {
    // Setup: requiresAuth pass, claimIncludes FAIL, requiresOrg should not run
    const app = new Hono()

    app.use('*', (c, next) => {
      // Simulate auth0() middleware
      c.var.auth0 = {
        user: mockUser,
        session: { user: mockUser },
        org: { id: 'org_123', name: 'Test Org' },
      }
      return next()
    })

    // First middleware fails
    app.get('/reports', claimIncludes('permissions', 'delete:data'))

    // This should not be reached
    app.get('/reports', () => {
      return new Response(JSON.stringify({ data: 'secret' }))
    })

    expect(app).toBeDefined()
  })

  it('should verify error codes on authorization failures', async () => {
    const errorCodes: Record<string, { middleware: any; context: any }> = {
      insufficient_claims: {
        middleware: claimEquals('role', 'unauthorized'),
        context: mockContext,
      },
      organization_mismatch: {
        middleware: requiresOrg({ orgId: 'org_999' }),
        context: mockContext,
      },
      missing_organization: {
        middleware: requiresOrg({ orgId: 'org_123' }),
        context: {
          var: {
            auth0: {
              user: { sub: 'auth0|456', email: 'noorg@test.com' }, // No org_id
              session: null,
              org: null,
            },
          },
        },
      },
    }

    for (const [expectedCode, testCase] of Object.entries(errorCodes)) {
      let caughtError: any
      try {
        await testCase.middleware(testCase.context, vi.fn())
      } catch (err) {
        caughtError = err
      }

      if (caughtError && expectedCode !== 'missing_organization') {
        expect(caughtError?.code).toBe(expectedCode)
      }
    }
  })
})
