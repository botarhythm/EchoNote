import { Pool } from 'pg';
import type { Session, SessionStatus, Utterance, SessionSummary, ClientSettings } from './types';

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
  // マイグレーション
  await p.query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS progress_message TEXT`);
  await p.query(`ALTER TABLE shares ADD COLUMN IF NOT EXISTS masked_terms TEXT`);
  await p.query(`ALTER TABLE shares ADD COLUMN IF NOT EXISTS anonymized_summary_json TEXT`);
  await p.query(`ALTER TABLE shares ADD COLUMN IF NOT EXISTS anonymized_transcript_json TEXT`);

  // クライアント設定テーブル
  await p.query(`
    CREATE TABLE IF NOT EXISTS client_settings (
      client_name TEXT PRIMARY KEY,
      notes TEXT NOT NULL DEFAULT '',
      speaker_a_name TEXT NOT NULL DEFAULT 'もっちゃん',
      speaker_b_name TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 起動時: 前回のサーバー再起動で中断されたセッションをリセット
  const stuckResult = await p.query(
    `UPDATE sessions
     SET status = 'error',
         error_message = 'サーバー再起動により処理が中断されました。再処理してください。',
         progress_message = ''
     WHERE status IN ('pending', 'transcribing', 'summarizing')
     RETURNING id`
  );
  if (stuckResult.rowCount && stuckResult.rowCount > 0) {
    const ids = stuckResult.rows.map((r: { id: string }) => r.id).join(', ');
    console.log(`[EchoNote] 中断セッションをリセット: ${ids}`);
  }
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
  progress_message: string | null;
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
    progressMessage: row.progress_message || undefined,
  };
}

export async function updateProgress(id: string, message: string): Promise<void> {
  const p = getPool();
  await p.query('UPDATE sessions SET progress_message = $1 WHERE id = $2', [message, id]);
}

/** チャンク完了ごとに中間トランスクリプトをDBへ保存（サーバー再起動時に復元可能） */
export async function savePartialTranscript(id: string, utterances: Utterance[]): Promise<void> {
  const p = getPool();
  await p.query('UPDATE sessions SET transcript_json = $1 WHERE id = $2', [
    JSON.stringify(utterances),
    id,
  ]);
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

/** クライアント名でフィルタし、完了済みセッションを日付昇順で返す（クロス分析用） */
export async function getSessionsByClient(clientName: string): Promise<Session[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT * FROM sessions
     WHERE client_name = $1 AND status = 'done' AND summary_json IS NOT NULL
     ORDER BY session_date ASC, created_at ASC`,
    [clientName]
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

export async function createShare(
  sessionId: string,
  privacy?: {
    maskedTerms: string[];
    anonymizedSummaryJson: string;
    anonymizedTranscriptJson: string;
  }
): Promise<string> {
  const p = getPool();
  const { randomBytes } = await import('crypto');
  const token = randomBytes(16).toString('hex');

  if (privacy) {
    // プライバシー保護モード：常に新規トークンを発行
    await p.query(
      `INSERT INTO shares (token, session_id, masked_terms, anonymized_summary_json, anonymized_transcript_json)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        token,
        sessionId,
        JSON.stringify(privacy.maskedTerms),
        privacy.anonymizedSummaryJson,
        privacy.anonymizedTranscriptJson,
      ]
    );
  } else {
    // 通常モード：既存トークンを再利用
    const existing = await p.query(
      'SELECT token FROM shares WHERE session_id = $1 AND masked_terms IS NULL',
      [sessionId]
    );
    if (existing.rows.length > 0) return existing.rows[0].token as string;

    await p.query('INSERT INTO shares (token, session_id) VALUES ($1, $2)', [token, sessionId]);
  }

  return token;
}

export interface ShareData {
  session: Session;
  isAnonymized: boolean;
  maskedTerms?: string[];
}

export async function getShareData(token: string): Promise<ShareData | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT s.*, sh.masked_terms, sh.anonymized_summary_json, sh.anonymized_transcript_json
     FROM sessions s JOIN shares sh ON s.id = sh.session_id WHERE sh.token = $1`,
    [token]
  );
  if (res.rows.length === 0) return null;

  const row = res.rows[0] as SessionRow & {
    masked_terms: string | null;
    anonymized_summary_json: string | null;
    anonymized_transcript_json: string | null;
  };
  const session = rowToSession(row);

  if (row.anonymized_summary_json) {
    session.summary = JSON.parse(row.anonymized_summary_json) as Session['summary'];
  }
  if (row.anonymized_transcript_json) {
    session.transcript = JSON.parse(row.anonymized_transcript_json) as Session['transcript'];
  }

  return {
    session,
    isAnonymized: !!row.anonymized_summary_json,
    maskedTerms: row.masked_terms ? (JSON.parse(row.masked_terms) as string[]) : undefined,
  };
}

export async function getSessionByShareToken(token: string): Promise<Session | null> {
  const data = await getShareData(token);
  return data?.session ?? null;
}

export async function deleteSession(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM shares WHERE session_id = $1', [id]);
  await p.query('DELETE FROM sessions WHERE id = $1', [id]);
}

export interface ShareRecord {
  token: string;
  sessionId: string;
  createdAt: string;
  isAnonymized: boolean;
  maskedTerms?: string[];
}

export async function getSharesBySession(sessionId: string): Promise<ShareRecord[]> {
  const p = getPool();
  const res = await p.query(
    'SELECT token, session_id, created_at, masked_terms, anonymized_summary_json FROM shares WHERE session_id = $1 ORDER BY created_at DESC',
    [sessionId]
  );
  return (res.rows as {
    token: string;
    session_id: string;
    created_at: string;
    masked_terms: string | null;
    anonymized_summary_json: string | null;
  }[]).map((row) => ({
    token: row.token,
    sessionId: row.session_id,
    createdAt: row.created_at,
    isAnonymized: !!row.anonymized_summary_json,
    maskedTerms: row.masked_terms ? (JSON.parse(row.masked_terms) as string[]) : undefined,
  }));
}

export async function revokeShare(token: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM shares WHERE token = $1', [token]);
}

export async function getClientSettings(clientName: string): Promise<ClientSettings> {
  const p = getPool();
  const res = await p.query('SELECT * FROM client_settings WHERE client_name = $1', [clientName]);
  if (res.rows.length === 0) {
    return { clientName, notes: '', speakerA: 'もっちゃん', speakerB: clientName };
  }
  const row = res.rows[0] as {
    client_name: string;
    notes: string;
    speaker_a_name: string;
    speaker_b_name: string;
    updated_at: string;
  };
  return {
    clientName: row.client_name,
    notes: row.notes,
    speakerA: row.speaker_a_name,
    speakerB: row.speaker_b_name,
    updatedAt: row.updated_at,
  };
}

export async function upsertClientSettings(settings: Omit<ClientSettings, 'updatedAt'>): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO client_settings (client_name, notes, speaker_a_name, speaker_b_name, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (client_name) DO UPDATE SET
       notes = EXCLUDED.notes,
       speaker_a_name = EXCLUDED.speaker_a_name,
       speaker_b_name = EXCLUDED.speaker_b_name,
       updated_at = NOW()`,
    [settings.clientName, settings.notes, settings.speakerA, settings.speakerB]
  );
}
