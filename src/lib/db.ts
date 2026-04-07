import { Pool } from 'pg';
import type { Session, SessionStatus, Utterance, SessionSummary } from './types';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

export async function initDb(): Promise<void> {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      client_name TEXT NOT NULL,
      session_date TEXT NOT NULL,
      memo TEXT,
      mime_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      transcript_json TEXT,
      summary_json TEXT,
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS shares (
      token TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

interface SessionRow {
  id: string;
  filename: string;
  client_name: string;
  session_date: string;
  memo: string | null;
  mime_type: string;
  status: string;
  transcript_json: string | null;
  summary_json: string | null;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    meta: {
      date: row.session_date,
      clientName: row.client_name,
      memo: row.memo || undefined,
      originalFilename: row.filename,
      driveFileId: row.id,
      mimeType: row.mime_type,
    },
    status: row.status as SessionStatus,
    transcript: row.transcript_json
      ? (JSON.parse(row.transcript_json) as Utterance[])
      : undefined,
    summary: row.summary_json
      ? (JSON.parse(row.summary_json) as SessionSummary)
      : undefined,
    error: row.error_message || undefined,
    processedAt: row.processed_at || undefined,
  };
}

export async function upsertSession(session: Partial<Session> & { id: string }): Promise<void> {
  const p = getPool();
  const existing = await p.query('SELECT id FROM sessions WHERE id = $1', [session.id]);

  if (existing.rows.length > 0) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    if (session.status) {
      sets.push(`status = $${idx++}`);
      vals.push(session.status);
    }
    if (session.transcript) {
      sets.push(`transcript_json = $${idx++}`);
      vals.push(JSON.stringify(session.transcript));
    }
    if (session.summary) {
      sets.push(`summary_json = $${idx++}`);
      vals.push(JSON.stringify(session.summary));
    }
    if (session.meta) {
      sets.push(`filename = $${idx++}`);
      vals.push(session.meta.originalFilename);
      sets.push(`client_name = $${idx++}`);
      vals.push(session.meta.clientName);
      sets.push(`session_date = $${idx++}`);
      vals.push(session.meta.date);
    }
    if (session.error !== undefined) {
      sets.push(`error_message = $${idx++}`);
      vals.push(session.error || null);
    }
    if (session.processedAt) {
      sets.push(`processed_at = $${idx++}`);
      vals.push(session.processedAt);
    }

    if (sets.length > 0) {
      vals.push(session.id);
      await p.query(
        `UPDATE sessions SET ${sets.join(', ')} WHERE id = $${idx}`,
        vals
      );
    }
  } else if (session.meta) {
    await p.query(
      `INSERT INTO sessions (id, filename, client_name, session_date, memo, mime_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        session.id,
        session.meta.originalFilename,
        session.meta.clientName,
        session.meta.date,
        session.meta.memo || null,
        session.meta.mimeType,
        session.status || 'pending',
      ]
    );
  }
}

export async function getSession(id: string): Promise<Session | null> {
  const p = getPool();
  const res = await p.query('SELECT * FROM sessions WHERE id = $1', [id]);
  return res.rows.length > 0 ? rowToSession(res.rows[0] as SessionRow) : null;
}

export async function getAllSessions(): Promise<Session[]> {
  const p = getPool();
  const res = await p.query(
    'SELECT * FROM sessions ORDER BY session_date DESC, created_at DESC'
  );
  return (res.rows as SessionRow[]).map(rowToSession);
}

export async function updateStatus(
  id: string,
  status: SessionStatus,
  data?: Partial<Session>
): Promise<void> {
  await upsertSession({ id, status, ...data });
}

export async function createShare(sessionId: string): Promise<string> {
  const p = getPool();
  const existing = await p.query('SELECT token FROM shares WHERE session_id = $1', [sessionId]);
  if (existing.rows.length > 0) return existing.rows[0].token as string;

  const { randomBytes } = await import('crypto');
  const token = randomBytes(16).toString('hex');
  await p.query('INSERT INTO shares (token, session_id) VALUES ($1, $2)', [token, sessionId]);
  return token;
}

export async function getSessionByShareToken(token: string): Promise<Session | null> {
  const p = getPool();
  const res = await p.query(
    'SELECT s.* FROM sessions s JOIN shares sh ON s.id = sh.session_id WHERE sh.token = $1',
    [token]
  );
  return res.rows.length > 0 ? rowToSession(res.rows[0] as SessionRow) : null;
}
