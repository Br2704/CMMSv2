const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function fix() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/TamOptiX%20CMMS' });
  await client.connect();

  const hash1 = await bcrypt.hash('TamOptiX@09022026', 10);
  await client.query(
    'UPDATE users SET password_hash = $1, failed_login_count = 0, locked_until = NULL WHERE email = $2',
    [hash1, 'admin@tamoptix.tech']
  );

  const hash2 = await bcrypt.hash('JKFenner@123', 10);
  await client.query(
    'UPDATE users SET password_hash = $1, failed_login_count = 0, locked_until = NULL WHERE email = $2',
    [hash2, 'admin@jkfenner.com']
  );

  console.log('Fixed passwords and reset failed login count / lockouts');
  await client.end();
}

fix();
