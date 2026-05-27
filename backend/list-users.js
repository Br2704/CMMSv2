const { Client } = require('pg');

async function listUsers() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/TamOptiX%20CMMS' });
  await client.connect();

  const res = await client.query('SELECT id, email, full_name FROM users');
  console.log('--- DATABASE USERS ---');
  console.log(res.rows);
  console.log('----------------------');

  await client.end();
}

listUsers().catch(console.error);
