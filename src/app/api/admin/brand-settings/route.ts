import { NextRequest, NextResponse } from 'next/server';
import { getBrandSettings, upsertBrandSettings, type BrandSettingsRow } from '@/lib/db';
import { getBrandConfig } from '@/lib/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * ブランド設定の管理画面用 API。
 *
 * GET:  現在のブランド設定（DB）を返す。DB未保存なら env から読み込んだ値を返す（初回起動の prefill 用）。
 * PUT:  フォームから受け取った設定を DB に保存する。即時反映される（再デプロイ不要）。
 */

const EMPTY_SETTINGS: BrandSettingsRow = {
  enabled: false,
  name: '',
  shortName: '',
  hostName: '',
  hostFullName: '',
  hostKeywords: '',
  philosophy: '',
  approach: '',
  hostStrength: '',
  sessionFlow: '',
  modeLabel: '',
};

export async function GET() {
  // DB に保存済みなら DB の値、未保存なら env からの bootstrap 値を返す
  const db = await getBrandSettings();
  if (db) {
    return NextResponse.json({ settings: db, source: 'database' });
  }
  const bootstrap = await getBrandConfig();
  if (bootstrap) {
    return NextResponse.json({
      settings: {
        enabled: true,
        name: bootstrap.name,
        shortName: bootstrap.shortName,
        hostName: bootstrap.hostName,
        hostFullName: bootstrap.hostFullName,
        hostKeywords: bootstrap.hostKeywords.join(','),
        philosophy: bootstrap.philosophy,
        approach: bootstrap.approach,
        hostStrength: bootstrap.hostStrength,
        sessionFlow: bootstrap.sessionFlow,
        modeLabel: bootstrap.modeLabel,
      } satisfies BrandSettingsRow,
      source: 'environment',
    });
  }
  return NextResponse.json({ settings: EMPTY_SETTINGS, source: 'empty' });
}

export async function PUT(request: NextRequest) {
  let body: Partial<BrandSettingsRow>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON が読めません' }, { status: 400 });
  }

  const settings: Omit<BrandSettingsRow, 'updatedAt'> = {
    enabled: !!body.enabled,
    name: (body.name ?? '').toString().trim(),
    shortName: (body.shortName ?? '').toString().trim(),
    hostName: (body.hostName ?? '').toString().trim(),
    hostFullName: (body.hostFullName ?? '').toString().trim(),
    hostKeywords: (body.hostKeywords ?? '').toString().trim(),
    philosophy: (body.philosophy ?? '').toString().trim(),
    approach: (body.approach ?? '').toString().trim(),
    hostStrength: (body.hostStrength ?? '').toString().trim(),
    sessionFlow: (body.sessionFlow ?? '').toString().trim(),
    modeLabel: (body.modeLabel ?? '').toString().trim(),
  };

  // enabled = true のときは name と hostName を必須にする
  if (settings.enabled && (!settings.name || !settings.hostName)) {
    return NextResponse.json(
      { error: 'ブランドモードを有効化するにはブランド名とホスト名が必要です' },
      { status: 400 }
    );
  }

  try {
    await upsertBrandSettings(settings);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/brand-settings] save failed:', err);
    return NextResponse.json({ error: `保存失敗: ${msg}` }, { status: 500 });
  }
}
