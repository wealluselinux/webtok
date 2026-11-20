#!/usr/bin/env node
/* Site-owner tool: sets a new password for a user.
   Run it on a computer that has this repo (run `npm install` once), with your Turso settings in the environment:
     TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node tools/reset_password.js person@example.com
   It prints a new temporary password. Send it to the person (not in public), and they sign in with it.
   Optional: add your own password as a second argument:  node tools/reset_password.js person@example.com "My!NewPassw0rd" */
const { createClient } = require("@libsql/client");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const [email, given] = process.argv.slice(2);
if (!email) { console.error("Usage: node tools/reset_password.js person@example.com [new-password]"); process.exit(1); }
if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) { console.error("Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN first."); process.exit(1); }

function makePassword() {
  const pick = s => s[crypto.randomInt(s.length)];
  const sets = ["abcdefghjkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%&*?"];
  const all = sets.join("");
  const chars = [...sets.map(pick), ...Array.from({ length: 10 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}

(async () => {
  const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  const em = email.trim().toLowerCase();
  const found = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [em] });
  if (!found.rows.length) { console.error("No account with that email."); process.exit(1); }
  const pw = given || makePassword();
  if (pw.length < 10 || !/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw) || !/[^A-Za-z0-9]/.test(pw)) {
    console.error("Password needs 10+ characters with upper and lower case, a number and a symbol."); process.exit(1);
  }
  await db.execute({ sql: "UPDATE users SET encrypted_password = ? WHERE email = ?", args: [await bcrypt.hash(pw, 10), em] });
  console.log(`Password changed for ${em}\nNew password: ${pw}`);
})().catch(e => { console.error(e.message); process.exit(1); });
