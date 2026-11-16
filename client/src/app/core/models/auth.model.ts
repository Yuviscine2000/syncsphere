export type AuthUserStatus = 'active' | 'disabled';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly status: AuthUserStatus;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly lastLoginAt: string | null;
  readonly createdAt: string | null;
}

export interface AuthSession {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresIn: number;
  readonly csrfToken: string;
  readonly sessionId: string;
  readonly user: AuthUser;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly fullName: string;
}

export interface RegisterResponse {
  readonly user: AuthUser;
}

export interface LogoutResponse {
  readonly loggedOut: boolean;
  readonly revoked: boolean;
}

export interface SessionInfo {
  readonly id: string;
  readonly createdAt: string;
  readonly lastUsedAt: string;
  readonly expiresAt: string;
  readonly current: boolean;
}

export interface SessionListResponse {
  readonly sessions: readonly SessionInfo[];
}

export interface AuthErrorDetail {
  readonly source?: string;
  readonly path?: string;
  readonly message?: string;
  readonly code?: string;
}

export interface AuthErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: readonly AuthErrorDetail[];
}

export interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data: T;
  readonly error: AuthErrorBody | null;
  readonly metadata: {
    readonly requestId: string | null;
    readonly correlationId: string | null;
    readonly timestamp: string;
    readonly version: string | null;
  };
}
