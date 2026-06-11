#!/usr/bin/env node
const fs = require('node:fs');
const crypto = require('node:crypto');
const { upsertUser } = require('../lib/auth');

function loadEnvFile(path) {
  if (!path) return;
  const text = fs.readFileSync(path, 'utf8');
  for (const line of text.split(/\n/)) {
    const match = line.match(/^([^#=\s]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function usage() {
  console.error(`Usage:
  node scripts/upsert-c-level-users.js --env /tmp/pmo-vercel-prod.env --users '[{"email":"name@azumo.co","name":"Name","password":"TempPassword123!"}]'

Options:
  --env PATH       Optional env file containing DATABASE_URL
  --users JSON     Required array of users. Role defaults to Executive.
  --role ROLE      Optional role override. Default: Executive
`);
  process.exit(1);
}

function arg(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : '';
}

async function main() {
  loadEnvFile(arg('--env'));
  const usersJson = arg('--users');
  const role = arg('--role') || 'Executive';
  if (!process.env.DATABASE_URL || !usersJson) usage();

  const users = JSON.parse(usersJson);
  if (!Array.isArray(users) || !users.length) usage();

  const output = [];
  for (const entry of users) {
    const email = String(entry.email || '').trim().toLowerCase();
    const name = String(entry.name || email).trim();
    const password = String(entry.password || `${crypto.randomBytes(9).toString('base64url')}Aa1!`);
    if (!email || !email.includes('@')) throw new Error(`Invalid email: ${entry.email || ''}`);
    const userRole = String(entry.role || role || 'Executive').trim();
    const user = await upsertUser({ email, name, role: userRole, password, active: true });
    output.push({ email: user.email, name: user.name, role: user.role, temporary_password: password });
  }

  console.log(JSON.stringify({ created_or_updated: output }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
