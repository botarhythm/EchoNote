'use client';

import { useState, useEffect } from 'react';
import type { ClientSettings } from '@/lib/types';

interface ClientSettingsPanelProps {
  clientName: string;
  onClose: () => void;
}

export function ClientSettingsPanel({ clientName, onClose }: ClientSettingsPanelProps) {
  const [speakerA, setSpeakerA] = useState('もっちゃん');
  const [speakerB, setSpeakerB] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!clientName) return;
    setLoading(true);
    fetch(`/api/clients/${encodeURIComponent(clientName)}/settings`)
      .then((r) => r.json())
      .then((data: { settings: ClientSettings }) => {
        setSpeakerA(data.settings.speakerA || 'もっちゃん');
        setSpeakerB(data.settings.speakerB || clientName);
        setNotes(data.settings.notes || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [clientName]);

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      await fetch(`/api/clients/${encodeURIComponent(clientName)}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, speakerA, speakerB }),
      });
      setSavedMsg('保存しました');
      setTimeout(() => setSavedMsg(null), 2000);
    } catch {
      setSavedMsg('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {clientName} の設定
        </h4>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          閉じる
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">読み込み中...</p>
      ) : (
        <div className="space-y-4">
          {/* 話者設定 */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">話者設定</p>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-slate-400">話者 A（アドバイザー）</span>
                <input
                  type="text"
                  value={speakerA}
                  onChange={(e) => setSpeakerA(e.target.value)}
                  placeholder="もっちゃん"
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-slate-400">話者 B（クライアント）</span>
                <input
                  type="text"
                  value={speakerB}
                  onChange={(e) => setSpeakerB(e.target.value)}
                  placeholder={clientName}
                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                />
              </label>
            </div>
          </div>

          {/* 共通メモ */}
          <div>
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">共通補正メモ</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="例: デジハラ = デジタル原っぱ大学&#10;例: 個人事業主。法人向け提案は不要。"
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
            />
          </div>

          {/* 保存ボタン */}
          <div className="flex items-center justify-end gap-3">
            {savedMsg && (
              <span className={`text-xs ${savedMsg.includes('失敗') ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {savedMsg}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
