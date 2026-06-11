#!/usr/bin/env node
const fs = require('node:fs');
const crypto = require('node:crypto');
const { neon } = require('@neondatabase/serverless');

function loadEnvFile(path){
  if(!path) return;
  const text = fs.readFileSync(path, 'utf8');
  for(const line of text.split(/\n/)){
    const match = line.match(/^([^#=\s]+)=(.*)$/);
    if(!match) continue;
    let value = match[2].trim();
    if((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    process.env[match[1]] = value;
  }
}
function usage(){
  console.error(`Usage:\n  node scripts/upsert-c-level-users.js --env /tmp/pmo-vercel-prod.env --users '[{"email":"name@azumo.co","name":"Name","password":"TempPassword123!"}]'\n\nOptions:\n  --env PATH       Optional env file containing DATABASE_URL\n  --users JSON     Required array of users. Role defaults to executive.\n  --role ROLE      Optional role override. Default: executive\n`);
  process.exit(1);
}
function arg(name){
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx+1] : '';
}
function hashPassword(password){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
async function ensureUsersTable(sql){
  await sql`
    CREATE TABLE IF NOT EXISTS pmo_users (
      id text PRIMARY KEY,
      email text UNIQUE NOT NULL,
      name text NOT NULL,
      role text NOT NULL DEFAULT 'viewer',
      password_hash text NOT NULL,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz
    )
  `;
}
async function main(){
  loadEnvFile(arg('--env'));
  const usersJson = arg('--users');
  const role = arg('--role') || 'executive';
  if(!process.env.DATABASE_URL || !usersJson) usage();
  const users = JSON.parse(usersJson);
  if(!Array.isArray(users) || !users.length) usage();
  const sql = neon(process.env.DATABASE_URL);
  await ensureUsersTable(sql);
  const output = [];
  for(const user of users){
    const email = String(user.email || '').trim().toLowerCase();
    const name = String(user.name || email).trim();
    const password = String(user.password || crypto.randomBytes(9).toString('base64url') + 'Aa1!');
    if(!email || !email.includes('@')) throw new Error(`Invalid email: ${user.email || ''}`);
    const userRole = String(user.role || role || 'executive').trim().toLowerCase();
    const passwordHash = hashPassword(password);
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO pmo_users (id, email, name, role, password_hash, active, updated_at)
      VALUES (${id}, ${email}, ${name}, ${userRole}, ${passwordHash}, true, now())
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        password_hash = EXCLUDED.password_hash,
        active = true,
        updated_at = now()
    `;
    output.push({email, name, role:userRole, temporary_password:password});
  }
  console.log(JSON.stringify({created_or_updated:output}, null, 2));
}
main().catch(error => { console.error(error.message); process.exit(1); });
