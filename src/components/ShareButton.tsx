'use client';

import { useState, useRef, useEffect } from 'react';

export function ShareButton({ sessionId, onCreated }: { sessionId: string; onCreated?: () => void }) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [maskedTerms, setMaskedTerms] = useState<string[]>([]);
  const [termInput, setTermInput] = useState('');
  const [suggestedTerms, setSuggestedTerms] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showModal) inputRef.current?.focus();
  }, [showModal]);

  const createShareLink = async (withPrivacy: boolean) => {
    setLoading(true);
    try {
      const body: { sessionId: string; maskedTerms?: string[] } = { sessionId };
      if (withPrivacy && maskedTerms.length > 0) {
        body.maskedTerms = maskedTerms;
      }

      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;

      const { token } = await res.json() as { token: string };
      const url = `${window.location.origin}/share/${token}`;
      setShareUrl(url);
      await copyToClipboard(url);
      setShowModal(false);
      onCreated?.();
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const fetchSuggestions = async () => {
    setLoadingSuggestions(true);
    setSuggestedTerms([]);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/privacy-suggestions`);
      if (res.ok) {
        const { terms } = await res.json() as { terms: string[] };
        setSuggestedTerms(terms.filter((t) => !maskedTerms.includes(t)));
      }
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const addTerm = (term?: string) => {
    const raw = term ?? termInput;
    // カンマ（半角/全角）・読点・各種空白（半角/全角/NBSP/タブ/改行）で複数語を一度に追加できるようにする
    // ブラウザ JS エンジンによる \s の挙動差を避けるため U+3000 と U+00A0 を明示
    const tokens = raw
      .split(/[,，、　 \s]+/u)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (tokens.length === 0) {
      if (!term) {
        setTermInput('');
        inputRef.current?.focus();
      }
      return;
    }
    setMaskedTerms((prev) => {
      const next = [...prev];
      for (const t of tokens) {
        if (!next.includes(t)) next.push(t);
      }
      return next;
    });
    setSuggestedTerms((prev) => prev.filter((t) => !tokens.includes(t)));
    if (!term) {
      setTermInput('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTerm();
    }
  };

  const removeTerm = (term: string) => {
    setMaskedTerms((prev) => prev.filter((t) => t !== term));
  };

  if (shareUrl) {
    return (
      <button
        onClick={() => copyToClipboard(shareUrl)}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {copying ? 'コピーしました!' : 'URLをコピー'}
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={loading}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {loading ? '作成中...' : '共有リンク作成'}
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                共有リンクの作成
              </h2>
            </div>

            <div className="p-6 space-y-5">
              {/* プライバシー保護セクション */}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  匿名化するキーワード
                </p>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  入力した語句をサマリーから除外・言い換えて共有します。守秘義務や個人情報の保護に。
                  カンマ（,／、）・空白でまとめて追加できます。
                </p>

                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={termInput}
                    onChange={(e) => setTermInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="例：山田様、株式会社〇〇 田中商店"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500"
                  />
                  <button
                    onClick={() => addTerm()}
                    disabled={!termInput.trim()}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    追加
                  </button>
                </div>

                {maskedTerms.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {maskedTerms.map((term) => (
                      <span
                        key={term}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                      >
                        {term}
                        <button
                          onClick={() => removeTerm(term)}
                          className="ml-0.5 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

              {/* AI 提案セクション */}
              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    AIのおすすめ語句
                  </p>
                  <button
                    onClick={fetchSuggestions}
                    disabled={loadingSuggestions}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    {loadingSuggestions ? '分析中...' : suggestedTerms.length > 0 ? '再取得' : '提案を取得'}
                  </button>
                </div>

                {loadingSuggestions && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">AIがセッション内容を分析しています...</p>
                )}

                {!loadingSuggestions && suggestedTerms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedTerms.map((term) => (
                      <button
                        key={term}
                        onClick={() => addTerm(term)}
                        className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-600 transition-colors hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 dark:border-slate-600 dark:text-slate-400 dark:hover:border-amber-600 dark:hover:bg-amber-900/20 dark:hover:text-amber-300"
                      >
                        + {term}
                      </button>
                    ))}
                  </div>
                )}

                {!loadingSuggestions && suggestedTerms.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    「提案を取得」でAIが匿名化すべき語句を自動検出します
                  </p>
                )}
              </div>
              </div>

              {/* アクションボタン */}
              <div className="flex flex-col gap-2 pt-1">
                {maskedTerms.length > 0 && (
                  <button
                    onClick={() => createShareLink(true)}
                    disabled={loading}
                    className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-700 dark:hover:bg-amber-600"
                  >
                    {loading ? 'AIが匿名化中...' : `プライバシー保護して共有 (${maskedTerms.length}語句)`}
                  </button>
                )}
                <button
                  onClick={() => createShareLink(false)}
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {maskedTerms.length > 0 ? 'そのまま共有する' : '共有リンクを作成'}
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-sm text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
