INSERT IGNORE INTO roles (name, description) VALUES
  ('SUPER_ADMIN', 'Unrestricted platform administration'),
  ('ADMIN', 'Administrative user and platform access'),
  ('MANAGER', 'Read-oriented team management access'),
  ('USER', 'Default authenticated user');

INSERT IGNORE INTO permissions (name, description) VALUES
  ('users:read', 'Read user records'),
  ('users:create', 'Create user records'),
  ('users:update', 'Update user records'),
  ('users:delete', 'Delete user records'),
  ('dashboard:read', 'Read dashboard data'),
  ('admin:access', 'Access administrative endpoints');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'SUPER_ADMIN'
  AND p.name IN (
    'users:read',
    'users:create',
    'users:update',
    'users:delete',
    'dashboard:read',
    'admin:access'
  );

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'ADMIN'
  AND p.name IN (
    'users:read',
    'users:create',
    'users:update',
    'users:delete',
    'dashboard:read',
    'admin:access'
  );

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'MANAGER'
  AND p.name IN ('users:read', 'dashboard:read');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE r.name = 'USER'
  AND p.name IN ('dashboard:read');
