const { Client } = require('pg');

async function listPermissions() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/TamOptiX%20CMMS' });
  await client.connect();

  console.log('--- ORG ROLE PERMISSIONS ---');
  const res = await client.query(`
    SELECT rp.id, rp.role_id, r.key as role_key, rp.module_key, rp.actions 
    FROM org_role_permissions rp
    JOIN org_roles r ON r.id = rp.role_id
    WHERE r.organization_id = '9b94b29d-8376-44c2-a3c2-6ff6425cfb11'
  `);
  console.log(res.rows);
  console.log('----------------------------');

  await client.end();
}

listPermissions().catch(console.error);
