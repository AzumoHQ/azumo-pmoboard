const { upsertUser } = require('../lib/auth');

async function main() {
  const email = process.env.PMO_USER_EMAIL || process.argv[2];
  const name = process.env.PMO_USER_NAME || process.argv[3] || email;
  const role = process.env.PMO_USER_ROLE || process.argv[4] || 'PMO';
  const password = process.env.PMO_USER_PASSWORD || process.argv[5];

  if (!email || !password) {
    throw new Error('Usage: PMO_USER_EMAIL=email PMO_USER_PASSWORD=password [PMO_USER_NAME=name] [PMO_USER_ROLE=PMO] node scripts/create-pmo-user.js');
  }

  const user = await upsertUser({ email, name, role, password, active: true });
  console.log(`Upserted PMO user ${user.email} (${user.role})`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
