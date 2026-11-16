import { signal } from '@angular/core';
import { of } from 'rxjs';
import {
  ApiEnvelope,
  AuthSession,
  AuthUser,
} from '../app/core/models/auth.model';

export const TEST_USER: AuthUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'jane@example.com',
  fullName: 'Jane Doe',
  status: 'active',
  roles: ['USER'],
  permissions: ['dashboard:read'],
  lastLoginAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const TEST_SESSION: AuthSession = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  csrfToken: 'csrf-token',
  sessionId: '22222222-2222-4222-8222-222222222222',
  user: TEST_USER,
};

export function authEnvelope<T>(data: T): ApiEnvelope<T> {
  return {
    success: true,
    data,
    error: null,
    metadata: {
      requestId: 'request-id',
      correlationId: 'request-id',
      timestamp: '2026-01-01T00:00:00.000Z',
      version: '1.0.0',
    },
  };
}

export function authErrorEnvelope(code: string, message: string): object {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      details: [],
    },
    metadata: {
      requestId: 'request-id',
      correlationId: 'request-id',
      timestamp: '2026-01-01T00:00:00.000Z',
      version: '1.0.0',
    },
  };
}

export function createAuthServiceMock(options: {
  authenticated?: boolean;
  initialized?: boolean;
  permissions?: readonly string[];
} = {}) {
  const user = signal<AuthUser | null>(
    options.authenticated === false ? null : TEST_USER,
  );
  const initialized = signal(options.initialized ?? true);
  const permissions = signal<readonly string[]>(
    options.permissions ?? TEST_USER.permissions,
  );

  return {
    user: user.asReadonly(),
    initialized: initialized.asReadonly(),
    isAuthenticated: () => user() !== null,
    hasPermission: vi.fn((permission: string) =>
      permissions().includes(permission),
    ),
    hasAnyPermission: vi.fn((required: readonly string[]) =>
      required.some((permission) => permissions().includes(permission)),
    ),
    login: vi.fn(() => of(TEST_USER)),
    register: vi.fn(() => of(TEST_USER)),
    logout: vi.fn(() => of(undefined)),
    refresh: vi.fn(() => of(TEST_USER)),
    restoreSession: vi.fn(() => Promise.resolve(user() !== null)),
    loadCurrentUser: vi.fn(() => of(TEST_USER)),
    listSessions: vi.fn(() => of([])),
    revokeSession: vi.fn(() => of(undefined)),
    clearSession: vi.fn(() => {
      user.set(null);
      initialized.set(true);
    }),
    setUser: (nextUser: AuthUser | null) => {
      user.set(nextUser);
      initialized.set(true);
    },
    setPermissions: (nextPermissions: readonly string[]) => {
      permissions.set(nextPermissions);
    },
    setInitialized: (nextInitialized: boolean) => {
      initialized.set(nextInitialized);
    },
  };
}
