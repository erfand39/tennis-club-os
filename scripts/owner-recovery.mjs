import pg from 'pg';
import { makeAuthClient } from '../local/auth-client.mjs';

const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!email) throw new Error('Supply the local owner email.');
const client = new pg.Client({ connectionString: process.env.SAM_DATABASE_URL, connectionTimeoutMillis: 4000 });
await client.connect();
try {
  const { rows } = await client.query('select tennis_runtime.owner_email($1) as allowed', [email]);
  if (!rows[0].allowed) throw new Error('The account is not an active owner of this local club.');
  const auth = makeAuthClient(process.env.SAM_AUTH_URL, process.env.SAM_JWT_SECRET);
  const { data, error } = await auth.admin.generateLink({ type: 'recovery', email });
  if (error || !data.properties.hashed_token) throw new Error('Could not generate the local recovery link.');
  const link = new URL('/redeem?mode=recovery', process.env.SAM_ORIGIN);
  link.hash = new URLSearchParams({ token: data.properties.hashed_token }).toString();
  console.log(link.toString());
} finally {
  await client.end();
}
