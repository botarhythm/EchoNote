/**
 * Jishushitsu 側の `/api/invite-token` を S2S シークレットで叩き、
 * ワンタイム招待リンクを発行するヘルパー。
 */

export type InitialRec = 'off' | 'audio' | 'screen' | 'both';
export type Role = 'instructor' | 'student';

export interface IssueInviteOptions {
  role: Role;
  initialRec?: InitialRec;
}

export interface IssuedInvite {
  url: string;
  token: string;
  expiresAt: number;
  role: Role;
  initialRec: InitialRec;
}

export class JishushitsuConfigError extends Error {}

export async function issueJishushitsuInvite(
  opts: IssueInviteOptions
): Promise<IssuedInvite> {
  const baseUrl =
    process.env.NEXT_PUBLIC_DIGIHARA_BASE_URL ||
    process.env.DIGIHARA_BASE_URL ||
    '';
  const secret = process.env.JISHUSHITSU_SERVICE_SECRET || '';

  if (!baseUrl) {
    throw new JishushitsuConfigError(
      'NEXT_PUBLIC_DIGIHARA_BASE_URL が未設定です'
    );
  }
  if (!secret) {
    throw new JishushitsuConfigError(
      'JISHUSHITSU_SERVICE_SECRET が未設定です'
    );
  }

  const endpoint = new URL('/api/invite-token', baseUrl).toString();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Secret': secret,
    },
    body: JSON.stringify({
      role: opts.role,
      initialRec: opts.initialRec ?? 'off',
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Jishushitsu 招待トークン発行に失敗 (${res.status}): ${text.slice(0, 200)}`
    );
  }

  return (await res.json()) as IssuedInvite;
}

export function parseInitialRec(v: unknown): InitialRec {
  if (v === 'off' || v === 'audio' || v === 'screen' || v === 'both') return v;
  return 'off';
}
