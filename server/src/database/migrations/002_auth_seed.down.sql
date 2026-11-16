DELETE FROM role_permissions
WHERE role_id IN (
  SELECT id FROM roles WHERE name IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER')
);

DELETE FROM user_roles
WHERE role_id IN (
  SELECT id FROM roles WHERE name IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER')
);

DELETE FROM roles
WHERE name IN ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER');

DELETE FROM permissions
WHERE name IN (
  'users:read',
  'users:create',
  'users:update',
  'users:delete',
  'dashboard:read',
  'admin:access'
);
