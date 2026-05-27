-- ============================================================
-- Seed org_role_permissions for all org roles
-- This eliminates the "role_permissions_empty_fallback_used" warning spam
-- Mirrors the logic in buildFallbackPermissionsForRole() in authMiddleware.ts
-- ============================================================

-- Clean up any stale permissions first (idempotent)
DELETE FROM org_role_permissions;

-- Helper: Insert permissions for a role
-- Format: (role_id, organization_id, module_key, actions[])

-- ============================================================
-- JK Fenner Organization (9b94b29d-8376-44c2-a3c2-6ff6425cfb11)
-- ============================================================

-- SUPER_ADMIN (b4c73c14-82d9-4d0c-b199-b99fa9eae6ff)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', 'b4c73c14-82d9-4d0c-b199-b99fa9eae6ff', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('ORGANIZATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ','UPDATE']),
  ('USERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DEPARTMENTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SHIFTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('VENDORS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('GATES', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ASSETS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('WORK_ORDERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('PM', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('CALIBRATION', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('AMC', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('LOGS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DATA_LOGGING', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DASHBOARD', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ESG', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SAFETY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('REPORTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('NOTIFICATIONS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ALERTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SECURITY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('MODULES', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('MASTERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('BENCHMARKING', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ANALYTICS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT'])
) AS t(module_key, actions);

-- PLANT_ADMIN (1c5c5f53-e6ba-41c1-b54a-34300d51538e)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', '1c5c5f53-e6ba-41c1-b54a-34300d51538e', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('ORGANIZATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('USERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DEPARTMENTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SHIFTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('VENDORS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('GATES', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ASSETS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('WORK_ORDERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('PM', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('CALIBRATION', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('AMC', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('LOGS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DATA_LOGGING', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DASHBOARD', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ESG', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SAFETY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('REPORTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('NOTIFICATIONS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ALERTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SECURITY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('MODULES', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('MASTERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ANALYTICS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT'])
) AS t(module_key, actions);

-- MAINTENANCE_MANAGER (d64bcbd4-4e7e-4f2e-9220-0aaa9988fa94)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', 'd64bcbd4-4e7e-4f2e-9220-0aaa9988fa94', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('ASSETS', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('WORK_ORDERS', ARRAY['READ','CREATE','UPDATE','DELETE','APPROVE']),
  ('PM', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('CALIBRATION', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('AMC', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('LOGS', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE']),
  ('REPORTS', ARRAY['READ','CREATE','EXPORT']),
  ('NOTIFICATIONS', ARRAY['READ','UPDATE'])
) AS t(module_key, actions);

-- MAINTENANCE_USER (88a5148a-43cf-4323-b62f-def6c319258f)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', '88a5148a-43cf-4323-b62f-def6c319258f', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('ASSETS', ARRAY['READ']),
  ('PM', ARRAY['READ']),
  ('AMC', ARRAY['READ']),
  ('LOGS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ','CREATE','UPDATE']),
  ('CALIBRATION', ARRAY['READ','CREATE','UPDATE']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE']),
  ('NOTIFICATIONS', ARRAY['READ'])
) AS t(module_key, actions);

-- HR_USER (8440d04b-a283-44c3-9493-37e951f0f91b)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', '8440d04b-a283-44c3-9493-37e951f0f91b', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('ASSETS', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ']),
  ('PM', ARRAY['READ']),
  ('CALIBRATION', ARRAY['READ']),
  ('AMC', ARRAY['READ']),
  ('INVENTORY', ARRAY['READ']),
  ('LOGS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('SHIFTS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('VENDORS', ARRAY['READ']),
  ('ALERTS', ARRAY['READ']),
  ('USERS', ARRAY['READ','CREATE','UPDATE'])
) AS t(module_key, actions);

-- SCM_USER (fab86cb2-0fda-48cc-88cf-bd948bd5b969)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', 'fab86cb2-0fda-48cc-88cf-bd948bd5b969', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('VENDORS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE','DELETE'])
) AS t(module_key, actions);

-- PRODUCTION_USER (392b623c-f6fd-4bef-a940-09ddc1708aa1)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', '392b623c-f6fd-4bef-a940-09ddc1708aa1', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('ASSETS', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ','CREATE'])
) AS t(module_key, actions);

-- SAFETY_USER (2146974f-6421-4ad5-a0d8-a433969335f1)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', '2146974f-6421-4ad5-a0d8-a433969335f1', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('GATES', ARRAY['READ']),
  ('ESG', ARRAY['READ']),
  ('ALERTS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('DASHBOARD', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('SAFETY', ARRAY['READ','CREATE','UPDATE'])
) AS t(module_key, actions);

-- SECURITY (2167dc82-4832-48f6-9878-c8a4c0e2cff3)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', '2167dc82-4832-48f6-9878-c8a4c0e2cff3', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('DASHBOARD', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('GATES', ARRAY['READ','CREATE','UPDATE','EXPORT'])
) AS t(module_key, actions);

-- VENDOR (6d0dc385-a715-421b-afcc-640f070f2cd5)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', '6d0dc385-a715-421b-afcc-640f070f2cd5', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('AMC', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ'])
) AS t(module_key, actions);

-- VISITOR (53f1f4a4-1753-4908-b232-7489acf5712a) - minimal access
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', '53f1f4a4-1753-4908-b232-7489acf5712a', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ'])
) AS t(module_key, actions);

-- MAINTENANCE_USER (ce8e90c1-a220-4785-abcd-996e97a06436)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '9b94b29d-8376-44c2-a3c2-6ff6425cfb11', 'ce8e90c1-a220-4785-abcd-996e97a06436', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('ASSETS', ARRAY['READ']),
  ('PM', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ','CREATE'])
) AS t(module_key, actions);

-- ============================================================
-- TamOptiX Technologies Organization (160e05ce-aff2-42e4-bf6b-78d4804c327b)
-- ============================================================

-- SUPER_ADMIN (0875a283-7baf-4a21-b31f-f71c609f5ad9)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', '0875a283-7baf-4a21-b31f-f71c609f5ad9', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('ORGANIZATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ','UPDATE']),
  ('USERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DEPARTMENTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SHIFTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('VENDORS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('GATES', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ASSETS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('WORK_ORDERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('PM', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('CALIBRATION', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('AMC', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('LOGS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DATA_LOGGING', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DASHBOARD', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ESG', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SAFETY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('REPORTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('NOTIFICATIONS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ALERTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SECURITY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('MODULES', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('MASTERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('BENCHMARKING', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ANALYTICS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT'])
) AS t(module_key, actions);

-- PLANT_ADMIN (c4e4f09c-6bdc-4c70-8206-8971e7a0d3ff)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', 'c4e4f09c-6bdc-4c70-8206-8971e7a0d3ff', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('ORGANIZATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('USERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DEPARTMENTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SHIFTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('VENDORS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('GATES', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ASSETS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('WORK_ORDERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('PM', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('CALIBRATION', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('AMC', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('LOGS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DATA_LOGGING', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('DASHBOARD', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ESG', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SAFETY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('REPORTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('NOTIFICATIONS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ALERTS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('SECURITY', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('MODULES', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('MASTERS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT']),
  ('ANALYTICS', ARRAY['READ','CREATE','UPDATE','DELETE','EXPORT','APPROVE','ASSIGN','REJECT','CLOSE','IMPORT'])
) AS t(module_key, actions);

-- MAINTENANCE_MANAGER (a7344374-2374-42d8-b96d-e2e278e5781a)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', 'a7344374-2374-42d8-b96d-e2e278e5781a', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('ASSETS', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('WORK_ORDERS', ARRAY['READ','CREATE','UPDATE','DELETE','APPROVE']),
  ('PM', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('CALIBRATION', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('AMC', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('LOGS', ARRAY['READ','CREATE','UPDATE','DELETE']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE']),
  ('REPORTS', ARRAY['READ','CREATE','EXPORT']),
  ('NOTIFICATIONS', ARRAY['READ','UPDATE'])
) AS t(module_key, actions);

-- MAINTENANCE_USER (12e00695-e087-4bf7-ab5f-0e4689386abe)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', '12e00695-e087-4bf7-ab5f-0e4689386abe', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('ASSETS', ARRAY['READ']),
  ('PM', ARRAY['READ']),
  ('AMC', ARRAY['READ']),
  ('LOGS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ','CREATE','UPDATE']),
  ('CALIBRATION', ARRAY['READ','CREATE','UPDATE']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE']),
  ('NOTIFICATIONS', ARRAY['READ'])
) AS t(module_key, actions);

-- HR_USER (1abf4b74-1e4a-4082-a84b-82ef040d01fc)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', '1abf4b74-1e4a-4082-a84b-82ef040d01fc', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('ASSETS', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ']),
  ('PM', ARRAY['READ']),
  ('CALIBRATION', ARRAY['READ']),
  ('AMC', ARRAY['READ']),
  ('INVENTORY', ARRAY['READ']),
  ('LOGS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('SHIFTS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('VENDORS', ARRAY['READ']),
  ('ALERTS', ARRAY['READ']),
  ('USERS', ARRAY['READ','CREATE','UPDATE'])
) AS t(module_key, actions);

-- SCM_USER (01624bf5-d893-4cb8-ad33-e1876d87ebea)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', '01624bf5-d893-4cb8-ad33-e1876d87ebea', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('VENDORS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('INVENTORY', ARRAY['READ','CREATE','UPDATE','DELETE'])
) AS t(module_key, actions);

-- PRODUCTION_USER (1b431352-0404-4d96-8dbe-e2bb5dcd3e26)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', '1b431352-0404-4d96-8dbe-e2bb5dcd3e26', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('ASSETS', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('GATES', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ','CREATE'])
) AS t(module_key, actions);

-- SAFETY_USER (8168147f-14c9-4c7a-a2c2-4959c9b3c418)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', '8168147f-14c9-4c7a-a2c2-4959c9b3c418', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('GATES', ARRAY['READ']),
  ('ESG', ARRAY['READ']),
  ('ALERTS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('DASHBOARD', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('SAFETY', ARRAY['READ','CREATE','UPDATE'])
) AS t(module_key, actions);

-- SECURITY (6d47b4e8-9412-4621-8a78-b634844113e7)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', '6d47b4e8-9412-4621-8a78-b634844113e7', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('PLANTS', ARRAY['READ']),
  ('DEPARTMENTS', ARRAY['READ']),
  ('USERS', ARRAY['READ']),
  ('REPORTS', ARRAY['READ']),
  ('MASTERS', ARRAY['READ']),
  ('DASHBOARD', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('GATES', ARRAY['READ','CREATE','UPDATE','EXPORT'])
) AS t(module_key, actions);

-- VENDOR (e9fb08be-b5ee-42a4-b58d-6d0daaddc855)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', 'e9fb08be-b5ee-42a4-b58d-6d0daaddc855', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('AMC', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ'])
) AS t(module_key, actions);

-- VISITOR (20db4b98-527c-4107-972c-2f527cce63ad)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', '20db4b98-527c-4107-972c-2f527cce63ad', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ'])
) AS t(module_key, actions);

-- MAINTENANCE_USER (b45a6fb3-89f4-4bf0-8700-8870fdcf20aa)
INSERT INTO org_role_permissions (id, organization_id, role_id, module_key, actions, created_at, updated_at)
SELECT gen_random_uuid(), '160e05ce-aff2-42e4-bf6b-78d4804c327b', 'b45a6fb3-89f4-4bf0-8700-8870fdcf20aa', module_key, actions, NOW(), NOW()
FROM (VALUES
  ('DASHBOARD', ARRAY['READ']),
  ('ASSETS', ARRAY['READ']),
  ('PM', ARRAY['READ']),
  ('NOTIFICATIONS', ARRAY['READ']),
  ('WORK_ORDERS', ARRAY['READ','CREATE'])
) AS t(module_key, actions);

-- Verify
SELECT 'org_role_permissions seeded: ' || COUNT(*) AS result FROM org_role_permissions;
