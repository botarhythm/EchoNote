import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/db';
import {
  listAllRelevantFiles,
  downloadFileText,
  findExternalTranscript,
} from '@/lib/drive';
import type { Utterance } from '@/lib/types';

interface ExternalLine {
  timestamp: string | null;
  text: string;
}

interface CoverageReport {
  totalSentences: number;
  matchedSentences: number;
  ratio: number;
}

interface SuccessResponse {
  matched: true;
  fileName: string;
  fileId: string;
  rawText: string;
  lines: ExternalLine[];
  coverage: CoverageReport;
  missingSegments: string[];
}

interface NoMatchResponse {
  matched: false;
  candidates: { id: string; name: string; mimeType: string }[];
  reason: string;
}

/**
 * "[00:01:23] 〜" や "00:01:23 〜" のような行頭タイムスタンプを抽出する。
 * Google Recorder の出力に依存しないように、複数パターンに対応。
 */
function extractTimestampedLines(rawText: string): ExternalLine[] {
  const lines: ExternalLine[] = [];
  // 全行を走査、空行はスキップ
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // パターン1: [HH:MM:SS] または [MM:SS] で始まる
    let m = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/);
    if (m) {
      lines.push({ timestamp: normalizeTimestamp(m[1]!), text: m[2]!.trim() });
      continue;
    }
    // パターン2: HH:MM:SS または MM:SS で始まる（区切りはタブまたは複数スペース）
    m = line.match(/^(\d{1,2}:\d{2}(?::\d{2})?)[\s\t]+(.*)$/);
    if (m) {
      lines.push({ timestamp: normalizeTimestamp(m[1]!), text: m[2]!.trim() });
      continue;
    }
    // タイムスタンプなし — 直前行とマージするのではなく、独立行として保持
    lines.push({ timestamp: null, text: line });
  }
  return lines;
}

/** "MM:SS" を "00:MM:SS" に正規化 */
function normalizeTimestamp(ts: string): string {
  const parts = ts.split(':');
  if (parts.length === 2) return `00:${parts[0]!.padStart(2, '0')}:${parts[1]!.padStart(2, '0')}`;
  return parts.map((p) => p.padStart(2, '0')).join(':');
}

/** NFKC + 句読点・空白除去でテキスト比較用に正規化 */
function normalizeForCompare(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\s　、，。．・！？!?「」『』（）()【】\[\]、]/g, '')
    .toLowerCase();
}

function joinUtterances(utterances: Utterance[] | undefined): string {
  if (!utterances) return '';
  return utterances.map((u) => u.text).join('\n');
}

function computeCoverage(googleText: string, echonoteText: string): {
  coverage: CoverageReport;
  missingSegments: string[];
} {
  const echoNorm = normalizeForCompare(echonoteText);
  // Google を句点 / 改行で文に分割
  const sentences = googleText
    .split(/[。.!?！？\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4); // 短すぎる断片はノイズになるので除外

  const matched: boolean[] = [];
  for (const sent of sentences) {
    const norm = normalizeForCompare(sent);
    if (norm.length < 4) {
      matched.push(true); // 短いものは判定対象外（=マッチ扱い）
      continue;
    }
    // 全体一致を求めず、ほぼ含まれていれば OK とする
    // 文を 6 文字スライディングウィンドウで分け、半分以上が echo 側に含まれていればマッチ
    const window = 6;
    if (norm.length <= window) {
      matched.push(echoNorm.includes(norm));
      continue;
    }
    let hits = 0;
    let total = 0;
    for (let i = 0; i + window <= norm.length; i += window) {
      total++;
      if (echoNorm.includes(norm.slice(i, i + window))) hits++;
    }
    matched.push(total > 0 && hits / total >= 0.5);
  }

  const total = sentences.length;
  const matchedCount = matched.filter(Boolean).length;
  const missingSegments: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    if (!matched[i]) missingSegments.push(sentences[i]!);
    if (missingSegments.length >= 50) break;
  }
  return {
    coverage: {
      totalSentences: total,
      matchedSentences: matchedCount,
      ratio: total === 0 ? 1 : matchedCount / total,
    },
    missingSegments,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: 'セッションが見つかりません' }, { status: 404 });
  }

  let allFiles;
  try {
    allFiles = await listAllRelevantFiles();
  } catch (err) {
    return NextResponse.json(
      { error: `Drive一覧取得エラー: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const { matched, candidates } = findExternalTranscript(session.meta.originalFilename, allFiles);

  if (!matched) {
    const body: NoMatchResponse = {
      matched: false,
      reason: candidates.length > 0
        ? `完全一致ファイルなし。候補 ${candidates.length} 件あり。`
        : `Driveフォルダ内に対応するテキストファイルが見つかりませんでした（${session.meta.originalFilename}）`,
      candidates: candidates.map((c) => ({ id: c.id, name: c.name, mimeType: c.mimeType })),
    };
    return NextResponse.json(body, { status: 404 });
  }

  let rawText: string;
  try {
    rawText = await downloadFileText(matched);
  } catch (err) {
    return NextResponse.json(
      { error: `テキスト取得エラー: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }

  const lines = extractTimestampedLines(rawText);
  const echonoteText = joinUtterances(session.transcript);
  const { coverage, missingSegments } = computeCoverage(rawText, echonoteText);

  const body: SuccessResponse = {
    matched: true,
    fileName: matched.name,
    fileId: matched.id,
    rawText,
    lines,
    coverage,
    missingSegments,
  };
  return NextResponse.json(body);
}
