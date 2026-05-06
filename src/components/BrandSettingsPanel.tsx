'use client';

import { useEffect, useState } from 'react';

interface BrandSettings {
  enabled: boolean;
  name: string;
  shortName: string;
  hostName: string;
  hostFullName: string;
  hostKeywords: string;
  philosophy: string;
  approach: string;
  hostStrength: string;
  sessionFlow: string;
  modeLabel: string;
}

const EMPTY: BrandSettings = {
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

interface BrandSettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * ブランド設定の管理パネル（モーダル）。
 * 各 EchoNote インスタンスの管理者がブランド情報を編集する。
 *
 * 設定は DB に保存され、再デプロイなしで即時反映される。
 */
export function BrandSettingsPanel({ open, onClose }: BrandSettingsPanelProps) {
  const [settings, setSettings] = useState<BrandSettings>(EMPTY);
  const [source, setSource] = useState<'database' | 'environment' | 'empty'>('empty');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFeedback(null);
    fetch('/api/admin/brand-settings')
      .then((r) => r.json())
      .then((d: { settings: BrandSettings; source: 'database' | 'environment' | 'empty' }) => {
        setSettings(d.settings);
        setSource(d.source);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/brand-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSource('database');
      setFeedback({ ok: true, text: '保存しました。即時反映されます。' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback({ ok: false, text: msg });
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              ブランド設定
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              自分のEchoNoteの「深層分析モード」のトンマナを設定します。
              {source === 'environment' && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  env から読込中（初回）
                </span>
              )}
              {source === 'database' && (
                <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                  DB保存済み
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="閉じる"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">読み込み中...</p>
        ) : (
          <div className="space-y-4">
            {/* 有効化トグル */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => update('enabled', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  ブランドモードを有効化
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  オフの間は汎用議事録モード（PlaudNote風）のみが動作します
                </p>
              </div>
            </label>

            {/* 主要フィールド */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="ブランド名" placeholder="例: 塚越アカデミー" required>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => update('name', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="短縮ブランド名" placeholder="例: 塚越（タイトル用）">
                <input
                  type="text"
                  value={settings.shortName}
                  onChange={(e) => update('shortName', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="ホスト名（通称）" placeholder="例: 塚越さん" required>
                <input
                  type="text"
                  value={settings.hostName}
                  onChange={(e) => update('hostName', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="ホストのフルネーム" placeholder="例: 塚越暁">
                <input
                  type="text"
                  value={settings.hostFullName}
                  onChange={(e) => update('hostFullName', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="話者検出キーワード（カンマ区切り）" placeholder="例: 塚越,塚越さん" colSpan={2}>
                <input
                  type="text"
                  value={settings.hostKeywords}
                  onChange={(e) => update('hostKeywords', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="UIモードラベル" placeholder="例: 塚越メンタリング" colSpan={2}>
                <input
                  type="text"
                  value={settings.modeLabel}
                  onChange={(e) => update('modeLabel', e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            {/* システムプロンプト用の文脈 */}
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                システムプロンプトに埋め込まれる文脈（自分のトンマナを表現してください）
              </p>
              <Field label="サービス哲学" placeholder="例: 自走できる学びを中心に置く">
                <textarea
                  value={settings.philosophy}
                  onChange={(e) => update('philosophy', e.target.value)}
                  rows={2}
                  className={textareaClass}
                />
              </Field>
              <Field label="アプローチ" placeholder="例: 答えを与えるのではなく問いを共に立てる">
                <textarea
                  value={settings.approach}
                  onChange={(e) => update('approach', e.target.value)}
                  rows={2}
                  className={textareaClass}
                />
              </Field>
              <Field label="ホストの強み" placeholder="例: 学習者の現場感を尊重し、実体験から学ぶ場を作る">
                <textarea
                  value={settings.hostStrength}
                  onChange={(e) => update('hostStrength', e.target.value)}
                  rows={2}
                  className={textareaClass}
                />
              </Field>
              <Field label="セッションの典型的な流れ" placeholder="例: 課題の明確化 → 仮説 → 検証">
                <textarea
                  value={settings.sessionFlow}
                  onChange={(e) => update('sessionFlow', e.target.value)}
                  rows={2}
                  className={textareaClass}
                />
              </Field>
            </div>

            {/* 保存ボタン */}
            <div className="flex items-center justify-end gap-3">
              {feedback && (
                <span
                  className={`text-xs ${
                    feedback.ok
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {feedback.text}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 active:scale-95"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-amber-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';

const textareaClass = inputClass + ' resize-y';

function Field({
  label,
  placeholder,
  required,
  colSpan,
  children,
}: {
  label: string;
  placeholder?: string;
  required?: boolean;
  colSpan?: 2;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${colSpan === 2 ? 'col-span-2' : ''}`}>
      <span className="text-xs text-slate-500 dark:text-slate-400">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
        {placeholder && <span className="ml-1 text-[10px] text-slate-400">{placeholder}</span>}
      </span>
      {children}
    </label>
  );
}
