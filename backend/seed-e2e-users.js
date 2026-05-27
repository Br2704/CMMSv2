const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const crypto = require('crypto');

async function seed() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/TamOptiX%20CMMS' });
  await client.connect();

  const jkfOrgId = '9b94b29d-8376-44c2-a3c2-6ff6425cfb11';

  // 1. Create plant JKF MDU if not exists
  let plantId;
  const plantRes = await client.query('SELECT id FROM plants WHERE plant_code = $1', ['JKF MDU']);
  if (plantRes.rows.length > 0) {
    plantId = plantRes.rows[0].id;
  } else {
    plantId = crypto.randomUUID();
    await client.query(
      'INSERT INTO plants (id, plant_code, plant_name, organization_id, is_active) VALUES ($1, $2, $3, $4, TRUE)',
      [plantId, 'JKF MDU', 'JK Fenner Madurai Plant', jkfOrgId]
    );
    console.log('Created plant JKF MDU');
  }

  // 2. Define users to seed
  const usersToSeed = [
    {
      email: 'mduadmin@jkfenner.com',
      password: 'Admin@123!@#',
      fullName: 'JKF MDU Admin',
      role: 'PLANT_ADMIN',
      orgRoleId: '1c5c5f53-e6ba-41c1-b54a-34300d51538e',
      userCode: 'EMP-MDU-ADMIN'
    },
    {
      email: 'superadmin@jkfenner.com',
      password: 'Admin@123!@#',
      fullName: 'JKF Super Admin',
      role: 'SUPER_ADMIN',
      orgRoleId: 'b4c73c14-82d9-4d0c-b199-b99fa9eae6ff',
      userCode: 'EMP-SUPER_ADMIN'
    },
    {
      email: 'sample.1@example.com',
      password: 'Security@123',
      fullName: 'Security Officer',
      role: 'SECURITY',
      orgRoleId: '2167dc82-4832-48f6-9878-c8a4c0e2cff3',
      userCode: 'EMP-SECURITY'
    },
    {
      email: 'sample.4@example.com',
      password: 'Vendor@12345',
      fullName: 'Vendor User',
      role: 'VENDOR',
      orgRoleId: '6d0dc385-a715-421b-afcc-640f070f2cd5',
      userCode: 'EMP-VENDOR'
    },
    {
      email: 'sample.2@example.com',
      password: 'Visitor@123!',
      fullName: 'Visitor User',
      role: 'VISITOR',
      orgRoleId: '53f1f4a4-1753-4908-b232-7489acf5712a',
      userCode: 'EMP-VISITOR'
    },
    {
      email: 'senthilkumar@jkfenner.com',
      password: 'Technician@123',
      fullName: 'Senthil Kumar',
      role: 'MAINTENANCE_USER',
      orgRoleId: '88a5148a-43cf-4323-b62f-def6c319258f',
      userCode: 'EMP-TECHNICIAN'
    }
  ];

  for (const u of usersToSeed) {
    const userRes = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);
    let userId;
    const passwordHash = await bcrypt.hash(u.password, 10);
    if (userRes.rows.length > 0) {
      userId = userRes.rows[0].id;
      // Update existing user details/password
      await client.query(
        'UPDATE users SET password_hash = $1, full_name = $2, organization_id = $3, org_role_id = $4, failed_login_count = 0, locked_until = NULL WHERE id = $5',
        [passwordHash, u.fullName, jkfOrgId, u.orgRoleId, userId]
      );
      console.log(`Updated user: ${u.email}`);
    } else {
      userId = crypto.randomUUID();
      await client.query(
        'INSERT INTO users (id, email, password_hash, full_name, is_active, organization_id, org_role_id, failed_login_count, locked_until) VALUES ($1, $2, $3, $4, TRUE, $5, $6, 0, NULL)',
        [userId, u.email, passwordHash, u.fullName, jkfOrgId, u.orgRoleId]
      );
      console.log(`Created user: ${u.email}`);
    }

    // Ensure user_roles entry exists
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    await client.query(
      'INSERT INTO user_roles (id, user_id, role, plant_id) VALUES ($1, $2, $3, $4)',
      [crypto.randomUUID(), userId, u.role, plantId]
    );

    // Ensure profiles entry exists
    await client.query('DELETE FROM profiles WHERE user_id = $1', [userId]);
    await client.query(
      'INSERT INTO profiles (id, user_id, user_code, full_name, email, plant_id, is_active) VALUES ($1, $2, $3, $4, $5, $6, TRUE)',
      [crypto.randomUUID(), userId, u.userCode, u.fullName, u.email, plantId]
    );
  }

  console.log('Seeding completed successfully!');
  await client.end();
}

seed().catch(console.error);
