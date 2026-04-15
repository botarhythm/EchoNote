'use client';

import { useState, useEffect } from 'react';
import type { ClientSettings } from '@/lib/types';
import { CrossAnalysisView } from './CrossAnalysisView';

type PanelTab = 'settings' | 'analysis';

interface ClientSettingsPanelProps {
  clientName: string;
  onClose: () => void;
  initialTab?: PanelTab;
}

export function ClientSettingsPanel({ clientName, onClose, initialTab = 'settings' }: ClientSettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>(initialTab);
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
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/70">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('settings')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            設定
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'analysis'
                ? 'bg-violet-100 text-violet-700 shadow-sm dark:bg-violet-900/40 dark:text-violet-300'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            クロス分析
          </button>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-600 active:text-slate-800 dark:hover:text-slate-200"
        >
          閉じる
        </button>
      </div>

      <div className="p-4">
        {/* 設定タブ */}
        {activeTab === 'settings' && (
          loading ? (
            <p className="text-sm text-slate-400">読み込み中...</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">話者設定</p>
                <div className="flex gap-3">
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs text-slate-400">話者 A（アドバイザー）</span>
                    <input
                      type="text" value={speakerA}
                      onChange={(e) => setSpeakerA(e.target.value)}
                      placeholder="もっちゃん"
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1">
                    <span className="text-xs text-slate-400">話者 B（クライアント）</span>
                    <input
                      type="text" value={speakerB}
                      onChange={(e) => setSpeakerB(e.target.value)}
                      placeholder={clientName}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </label>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">共通補正メモ</p>
                <textarea
                  value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                  placeholder="例: デジハラ = デジタル原っぱ大学&#10;例: 個人事業主。法人向け提案は不要。"
                  className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:placeholder-slate-500"
                />
              </div>
              <div className="flex items-center justify-end gap-3">
                {savedMsg && (
                  <span className={`text-xs ${savedMsg.includes('失敗') ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {savedMsg}
                  </span>
                )}
                <button
                  onClick={handleSave} disabled={saving}
                  className="rounded-md bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 active:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
                >
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          )
        )}

        {/* クロス分析タブ */}
        {activeTab === 'analysis' && (
          <CrossAnalysisView clientName={clientName} />
        )}
      </div>
    </div>
  );
}
