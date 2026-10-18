import { loadIndex, loadSiteState } from '@sagas/fixtures/acceptance';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://sagas:sagas@127.0.0.1:5435/sagas_read',
});

const states = loadIndex().sites.flatMap((site) =>
  site.stateIds.map((stateId) => ({
    stateId,
    state: loadSiteState(site.key, stateId),
  })),
);

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS experience_read_model (
      slug        text NOT NULL,
      state_id    text NOT NULL CHECK (state_id IN ('t0', 't1', 't2', 't3')),
      site        jsonb NOT NULL,
      graph_state jsonb NOT NULL,
      PRIMARY KEY (slug, state_id)
    )
  `);
  await pool.query('BEGIN');
  for (const { stateId, state } of states) {
    await pool.query(
      `INSERT INTO experience_read_model (slug, state_id, site, graph_state)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (slug, state_id) DO UPDATE
       SET site = EXCLUDED.site, graph_state = EXCLUDED.graph_state`,
      [state.site.slug, stateId, state.site, state],
    );
  }
  await pool.query('COMMIT');
  console.log(`Seeded ${states.length} experience read-model states.`);
} catch (error) {
  await pool.query('ROLLBACK');
  throw error;
} finally {
  await pool.end();
}
