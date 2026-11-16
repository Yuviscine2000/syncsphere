function toIsoString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return new Date(value).toISOString();
}

function mapSessionRow(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    tokenHash: row.token_hash,
    tokenFamilyId: row.token_family_id,
    expiresAt: toIsoString(row.expires_at),
    revokedAt: toIsoString(row.revoked_at),
    createdAt: toIsoString(row.created_at),
    lastUsedAt: toIsoString(row.last_used_at),
  };
}

/**
 * Creates the MySQL-backed refresh-session repository. Rotation keeps token
 * history in the same family so reuse can revoke every descendant session.
 * @param {{ getMysqlClient: () => object }} options
 * @returns {object}
 */
export function createSessionRepository({ getMysqlClient }) {
  async function createSession(
    { userId, tokenHash, tokenFamilyId, expiresAt },
    queryable = null,
  ) {
    const executor = queryable ?? getMysqlClient();
    await executor.query(
      `INSERT INTO refresh_sessions
         (user_id, token_hash, token_family_id, expires_at)
       VALUES (?, ?, ?, ?)`,
      [userId, tokenHash, tokenFamilyId, new Date(expiresAt)],
    );
  }

  async function findByTokenHashForUpdate(tokenHash, transaction) {
    const result = await transaction.query(
      `SELECT id, user_id, token_hash, token_family_id, expires_at, revoked_at,
              created_at, last_used_at
       FROM refresh_sessions
       WHERE token_hash = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenHash],
    );

    const row = result.rows[0];
    return row === undefined ? null : mapSessionRow(row);
  }

  async function revokeSessionRow(sessionId, queryable) {
    await queryable.query(
      `UPDATE refresh_sessions
       SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3)),
           last_used_at = UTC_TIMESTAMP(3)
       WHERE id = ?`,
      [sessionId],
    );
  }

  async function revokeFamily({ userId, tokenFamilyId }, queryable = null) {
    const executor = queryable ?? getMysqlClient();
    const result = await executor.query(
      `UPDATE refresh_sessions
       SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP(3))
       WHERE user_id = ?
         AND token_family_id = ?
         AND revoked_at IS NULL`,
      [userId, tokenFamilyId],
    );

    return Number(result.rows.affectedRows ?? 0);
  }

  async function findActiveFamily({ userId, tokenFamilyId }, queryable = null) {
    const executor = queryable ?? getMysqlClient();
    const result = await executor.query(
      `SELECT id, user_id, token_hash, token_family_id, expires_at, revoked_at,
              created_at, last_used_at
       FROM refresh_sessions
       WHERE user_id = ?
         AND token_family_id = ?
         AND revoked_at IS NULL
         AND expires_at > UTC_TIMESTAMP(3)
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, tokenFamilyId],
    );

    const row = result.rows[0];
    return row === undefined ? null : mapSessionRow(row);
  }

  async function findFamilyForUser({ userId, tokenFamilyId }) {
    const result = await getMysqlClient().query(
      `SELECT id
       FROM refresh_sessions
       WHERE user_id = ? AND token_family_id = ?
       LIMIT 1`,
      [userId, tokenFamilyId],
    );

    return result.rows.length > 0;
  }

  async function listActiveFamilies(userId) {
    const result = await getMysqlClient().query(
      `SELECT token_family_id,
              MIN(created_at) AS created_at,
              MAX(last_used_at) AS last_used_at,
              MAX(expires_at) AS expires_at
       FROM refresh_sessions
       WHERE user_id = ?
         AND revoked_at IS NULL
         AND expires_at > UTC_TIMESTAMP(3)
       GROUP BY token_family_id
       ORDER BY MAX(last_used_at) DESC`,
      [userId],
    );

    return result.rows.map((row) => ({
      id: row.token_family_id,
      createdAt: toIsoString(row.created_at),
      lastUsedAt: toIsoString(row.last_used_at),
      expiresAt: toIsoString(row.expires_at),
    }));
  }

  return {
    createSession,
    findByTokenHashForUpdate,
    revokeSessionRow,
    revokeFamily,
    findActiveFamily,
    findFamilyForUser,
    listActiveFamilies,
  };
}
