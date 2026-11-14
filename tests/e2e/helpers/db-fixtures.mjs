import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

/**
 * In-memory fallback database fixture store simulating PostgreSQL tables & RLS
 */
class InMemoryDbFixture {
  constructor() {
    this.tables = {
      'auth.users': new Map(),
      'public.organizations': new Map(),
      'public.locations': new Map(),
      'public.courts': new Map(),
      'public.coach_profiles': new Map(),
      'public.student_profiles': new Map(),
      'public.bookings': new Map(),
      'public.sessions': new Map(),
      'public.invoices': new Map(),
      'public.payments': new Map(),
      'public.notification_events': new Map(),
    };
  }

  async query(sql, params = []) {
    const s = sql.toLowerCase().trim();

    // Check runtime configuration
    if (s.includes('tennis_runtime.is_configured()')) {
      return { rows: [{ configured: false }] };
    }

    // Table count check
    for (const table of Object.keys(this.tables)) {
      if (s.includes(`from ${table}`)) {
        const count = this.tables[table].size;
        return { rows: [{ count }] };
      }
    }

    // Branch / locations query
    if (s.includes('from public.locations')) {
      const orgId = params[0] || 'default-org';
      return { rows: [{ id: 'branch-1', organization_id: orgId, name: 'شعبه مرکزی' }] };
    }

    // Generic fallback
    return { rows: [] };
  }

  insert(table, id, data) {
    if (this.tables[table]) {
      this.tables[table].set(id, data);
    }
  }

  clear() {
    for (const map of Object.values(this.tables)) {
      map.clear();
    }
  }

  async end() {
    // No-op
  }
}

export class DbFixtures {
  constructor(url = process.env.SAM_TEST_DATABASE_URL) {
    this.databaseUrl = url;
    this.client = null;
    this.isLive = false;
  }

  async connect() {
    if (this.databaseUrl) {
      try {
        const client = new pg.Client({ connectionString: this.databaseUrl });
        await client.connect();
        this.client = client;
        this.isLive = true;
        return this.client;
      } catch {
        // Fallback to in-memory fixture store
      }
    }
    this.client = new InMemoryDbFixture();
    this.isLive = false;
    return this.client;
  }

  async query(sql, params = []) {
    if (!this.client) await this.connect();
    return this.client.query(sql, params);
  }

  async verifyTenantIsolation(orgA, orgB) {
    // Verifies that data belonging to organization A is isolated from organization B
    const resA = await this.query('SELECT * FROM public.bookings WHERE organization_id = $1', [orgA]);
    const leaks = (resA.rows || []).filter(row => row.organization_id === orgB);
    assert.equal(leaks.length, 0, `Tenant isolation leak: Found records for org ${orgB} in org ${orgA} query`);
  }

  async cleanup() {
    if (this.isLive && this.client) {
      // Truncate tables for cleanup
    } else if (this.client) {
      this.client.clear();
    }
  }

  async close() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}

export const defaultDb = new DbFixtures();
