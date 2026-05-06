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

  // ブランド設定テーブル（インスタンスごとに1行のみ。id=1 で固定）
  await p.query(`
    CREATE TABLE IF NOT EXISTS brand_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      name TEXT NOT NULL DEFAULT '',
      short_name TEXT NOT NULL DEFAULT '',
      host_name TEXT NOT NULL DEFAULT '',
      host_full_name TEXT NOT NULL DEFAULT '',
      host_keywords TEXT NOT NULL DEFAULT '',
      philosophy TEXT NOT NULL DEFAULT '',
      approach TEXT NOT NULL DEFAULT '',
      host_strength TEXT NOT NULL DEFAULT '',
      session_flow TEXT NOT NULL DEFAULT '',
      mode_label TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT brand_settings_singleton CHECK (id = 1)
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

/**
 * 詳細ページ用: transcript_json を除外して取得（書き起こしは別エンドポイントで取る）。
 * 1時間超のセッションでは transcript JSON が数MBになるため、毎回返すと体感が悪化する。
 */
export async function getSessionLite(id: string): Promise<Session | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, filename, client_name, session_date, memo, mime_type, status,
            summary_json, error_message, progress_message, created_at, processed_at
     FROM sessions WHERE id = $1`,
    [id]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0] as Omit<SessionRow, 'transcript_json'>;
  return rowToSession({ ...row, transcript_json: null });
}

/** transcript_json のみを取得 */
export async function getSessionTranscript(id: string): Promise<Utterance[] | null> {
  const p = getPool();
  const res = await p.query('SELECT transcript_json FROM sessions WHERE id = $1', [id]);
  if (res.rows.length === 0) return null;
  const json = (res.rows[0] as { transcript_json: string | null }).transcript_json;
  return json ? (JSON.parse(json) as Utterance[]) : null;
}

/**
 * 時系列順 ORDER BY 句。
 * - session_date が有効な YYYY-MM-DD の場合は date_priority=0 で日付降順
 * - '不明' など不正な値は date_priority=1 で末尾に回し、created_at 降順で並べる
 * - 同一日付の場合は created_at で安定ソート
 * AI が推測した session_date が信頼できない場合でも、登録時刻ベースで時系列が保たれる。
 */
const ORDER_BY_CHRONOLOGICAL = `
  ORDER BY
    CASE WHEN session_date ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN 0 ELSE 1 END,
    session_date DESC,
    created_at DESC
`;

export async function getAllSessions(): Promise<Session[]> {
  const p = getPool();
  const res = await p.query(`SELECT * FROM sessions ${ORDER_BY_CHRONOLOGICAL}`);
  return (res.rows as SessionRow[]).map(rowToSession);
}

/**
 * 一覧表示用：transcript_json を除外して取得（書き起こしは詳細ページでのみ必要）。
 * 大量の発話を含む transcript を毎回ロードすると一覧APIが重くなるため。
 */
export async function getAllSessionsLite(): Promise<Session[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, filename, client_name, session_date, memo, mime_type, status,
            summary_json, error_message, progress_message, created_at, processed_at
     FROM sessions
     ${ORDER_BY_CHRONOLOGICAL}`
  );
  return (res.rows as Omit<SessionRow, 'transcript_json'>[]).map((row) =>
    rowToSession({ ...row, transcript_json: null })
  );
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

  // 匿名化共有時は meta も匿名化値で上書き（共有ページ・SessionCard 等で
  // meta.clientName / originalFilename / memo がそのまま表示されるのを防ぐ）
  const maskedTerms = row.masked_terms ? (JSON.parse(row.masked_terms) as string[]) : undefined;
  if (row.anonymized_summary_json && session.summary) {
    const masked = (s: string | undefined): string | undefined => {
      if (!s || !maskedTerms || maskedTerms.length === 0) return s;
      const sorted = [...maskedTerms].filter((t) => t.length > 0).sort((a, b) => b.length - a.length);
      return sorted.reduce((text, term) => text.split(term).join('●●'), s);
    };
    session.meta = {
      ...session.meta,
      clientName: session.summary.clientName || masked(session.meta.clientName) || session.meta.clientName,
      originalFilename: masked(session.meta.originalFilename) ?? session.meta.originalFilename,
      memo: masked(session.meta.memo),
    };
  }

  return {
    session,
    isAnonymized: !!row.anonymized_summary_json,
    maskedTerms,
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
    return { clientName, notes: '', speakerA: '', speakerB: clientName };
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

// ─── ブランド設定 ───────────────────────────────────────────────────────────

export interface BrandSettingsRow {
  enabled: boolean;
  name: string;
  shortName: string;
  hostName: string;
  hostFullName: string;
  hostKeywords: string;  // カンマ区切り
  philosophy: string;
  approach: string;
  hostStrength: string;
  sessionFlow: string;
  modeLabel: string;
  updatedAt?: string;
}

interface BrandSettingsDbRow {
  enabled: boolean;
  name: string;
  short_name: string;
  host_name: string;
  host_full_name: string;
  host_keywords: string;
  philosophy: string;
  approach: string;
  host_strength: string;
  session_flow: string;
  mode_label: string;
  updated_at: string;
}

export async function getBrandSettings(): Promise<BrandSettingsRow | null> {
  try {
    const p = getPool();
    const res = await p.query('SELECT * FROM brand_settings WHERE id = 1');
    if (res.rows.length === 0) return null;
    const row = res.rows[0] as BrandSettingsDbRow;
    return {
      enabled: row.enabled,
      name: row.name,
      shortName: row.short_name,
      hostName: row.host_name,
      hostFullName: row.host_full_name,
      hostKeywords: row.host_keywords,
      philosophy: row.philosophy,
      approach: row.approach,
      hostStrength: row.host_strength,
      sessionFlow: row.session_flow,
      modeLabel: row.mode_label,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    console.error('[EchoNote] getBrandSettings failed:', err);
    return null;
  }
}

export async function upsertBrandSettings(
  settings: Omit<BrandSettingsRow, 'updatedAt'>
): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO brand_settings (
       id, enabled, name, short_name, host_name, host_full_name, host_keywords,
       philosophy, approach, host_strength, session_flow, mode_label, updated_at
     )
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       name = EXCLUDED.name,
       short_name = EXCLUDED.short_name,
       host_name = EXCLUDED.host_name,
       host_full_name = EXCLUDED.host_full_name,
       host_keywords = EXCLUDED.host_keywords,
       philosophy = EXCLUDED.philosophy,
       approach = EXCLUDED.approach,
       host_strength = EXCLUDED.host_strength,
       session_flow = EXCLUDED.session_flow,
       mode_label = EXCLUDED.mode_label,
       updated_at = NOW()`,
    [
      settings.enabled,
      settings.name,
      settings.shortName,
      settings.hostName,
      settings.hostFullName,
      settings.hostKeywords,
      settings.philosophy,
      settings.approach,
      settings.hostStrength,
      settings.sessionFlow,
      settings.modeLabel,
    ]
  );
}
