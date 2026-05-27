const { Client } = require('pg');

async function listAll() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/TamOptiX%20CMMS' });
  await client.connect();

  console.log('--- PLANTS ---');
  const plants = await client.query('SELECT id, plant_code, plant_name, organization_id FROM plants');
  console.log(plants.rows);

  console.log('--- ROLES ---');
  const roles = await client.query('SELECT id, name, description FROM roles');
  console.log(roles.rows);

  console.log('--- ORG ROLES ---');
  const orgRoles = await client.query('SELECT id, organization_id, key, name FROM org_roles');
  console.log(orgRoles.rows);

  await client.end();
}

listAll().catch(console.error);
