const { Client } = require('pg');

async function listAll() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/TamOptiX%20CMMS' });
  await client.connect();

  console.log('--- ORGANIZATIONS ---');
  const orgs = await client.query('SELECT id, name, code FROM organizations');
  console.log(orgs.rows);

  console.log('--- PLANTS ---');
  const plants = await client.query('SELECT id, name, code, organization_id FROM plants');
  console.log(plants.rows);

  console.log('--- ROLES ---');
  const roles = await client.query('SELECT id, name, description FROM roles');
  console.log(roles.rows);

  await client.end();
}

listAll().catch(console.error);
