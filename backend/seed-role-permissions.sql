-- ============================================================
-- Seed role_permissions from org_role_permissions
-- Maps org_role.key -> roles.name to populate the global role_permissions table
-- This eliminates the fallback warning when step 1 (org_role_permissions) is empty
-- ============================================================

-- Clean up first (idempotent)
DELETE FROM role_permissions;

-- Insert permissions by joining org_role_permissions data to global roles
-- via org_role.key matching roles.name
INSERT INTO role_permissions (id, role_id, role, module_key, module_id, actions, created_at, updated_at)
SELECT
  gen_random_uuid(),
  r.id,
  r.name,
  src.module_key,
  src.module_key AS module_id,
  src.actions,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT ON (o_r.key, orp.module_key)
    o_r.key,
    orp.module_key,
    orp.actions
  FROM org_role_permissions orp
  JOIN org_roles o_r ON o_r.id = orp.role_id
  ORDER BY o_r.key, orp.module_key
) src
JOIN roles r ON r.name = src.key;

-- Verify
SELECT 'role_permissions seeded: ' || COUNT(*) || ' rows' AS result FROM role_permissions;
