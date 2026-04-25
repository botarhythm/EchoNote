'use client';

import { useEffect, useRef, useState } from 'react';
import type { Utterance, SpeakerNames } from '@/lib/types';

interface TranscriptViewProps {
  transcript: Utterance[];
  speakerNames?: SpeakerNames;
  onSave?: (next: Utterance[]) => Promise<void> | void;
  editable?: boolean;
}

interface EditDraft {
  speaker: 'A' | 'B';
  timestamp: string;
  text: string;
}

export function TranscriptView({
  transcript,
  speakerNames,
  onSave,
  editable = false,
}: TranscriptViewProps) {
  const speakerLabel = (s: 'A' | 'B') =>
    speakerNames?.[s] ? speakerNames[s].slice(0, 4) : s;

  const [searchQuery, setSearchQuery] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 編集開始時にtextareaへ自動フォーカス＆カーソルを末尾へ
  useEffect(() => {
    if (editingIndex !== null && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingIndex]);

  const filteredEntries = transcript
    .map((u, originalIndex) => ({ utterance: u, originalIndex }))
    .filter(({ utterance }) =>
      searchQuery
        ? utterance.text.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    );

  const beginEdit = (index: number) => {
    const u = transcript[index];
    setDraft({ speaker: u.speaker, timestamp: u.timestamp, text: u.text });
    setEditingIndex(index);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setDraft(null);
  };

  const commitChange = async (next: Utterance[], index: number) => {
    if (!onSave) return;
    setSavingIndex(index);
    try {
      await onSave(next);
    } finally {
      setSavingIndex(null);
    }
  };

  const saveEdit = async () => {
    if (editingIndex === null || !draft) return;
    const trimmedText = draft.text.trim();
    if (!trimmedText) return;
    const next = transcript.map((u, i) =>
      i === editingIndex
        ? { speaker: draft.speaker, timestamp: draft.timestamp.trim(), text: trimmedText }
        : u
    );
    const idx = editingIndex;
    setEditingIndex(null);
    setDraft(null);
    await commitChange(next, idx);
  };

  const deleteUtterance = async (index: number) => {
    if (!onSave) return;
    if (!window.confirm('この発話を削除しますか？')) return;
    const next = transcript.filter((_, i) => i !== index);
    await commitChange(next, index);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void saveEdit();
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          placeholder="テキストを検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder-slate-500 dark:focus:border-slate-500"
        />
        {searchQuery && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
            {filteredEntries.length} 件
          </span>
        )}
      </div>

      {editable && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          各発話の鉛筆アイコンで編集できます。Cmd/Ctrl + Enter で保存、Esc で取消。
        </p>
      )}

      <div className="space-y-1">
        {filteredEntries.map(({ utterance, originalIndex }) => {
          const isEditing = editingIndex === originalIndex;
          const isSaving = savingIndex === originalIndex;
          const speakerColor =
            utterance.speaker === 'A'
              ? 'bg-blue-50 dark:bg-blue-950/30'
              : 'bg-emerald-50 dark:bg-emerald-950/30';
          const badgeColor =
            (isEditing ? draft?.speaker : utterance.speaker) === 'A'
              ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/30 dark:text-blue-300'
              : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/30 dark:text-emerald-300';

          return (
            <div
              key={originalIndex}
              className={`group flex gap-3 rounded px-3 py-2 transition-colors ${speakerColor} ${
                isSaving ? 'opacity-60' : ''
              }`}
            >
              <div className="flex shrink-0 flex-col items-center gap-0.5">
                {isEditing && draft ? (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, speaker: draft.speaker === 'A' ? 'B' : 'A' })
                    }
                    title="話者を切り替え"
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold transition-colors hover:opacity-80 ${badgeColor}`}
                  >
                    {speakerLabel(draft.speaker)}
                  </button>
                ) : (
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold ${badgeColor}`}
                  >
                    {speakerLabel(utterance.speaker)}
                  </span>
                )}
                {isEditing && draft ? (
                  <input
                    type="text"
                    value={draft.timestamp}
                    onChange={(e) => setDraft({ ...draft, timestamp: e.target.value })}
                    placeholder="00:00:00"
                    className="w-16 rounded border border-slate-200 bg-white px-1 py-0.5 text-center text-[10px] text-slate-600 focus:border-slate-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  />
                ) : (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {utterance.timestamp}
                  </span>
                )}
              </div>

              {isEditing && draft ? (
                <div className="flex flex-1 flex-col gap-2">
                  <textarea
                    ref={textareaRef}
                    value={draft.text}
                    onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                    onKeyDown={handleKeyDown}
                    rows={Math.min(8, Math.max(2, draft.text.split('\n').length + 1))}
                    className="w-full resize-y rounded border border-slate-300 bg-white px-2 py-1.5 text-sm leading-relaxed text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEdit()}
                      disabled={!draft.text.trim()}
                      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      保存
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700"
                    >
                      取消
                    </button>
                    <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                      Cmd/Ctrl + Enter で保存
                    </span>
                  </div>
                </div>
              ) : (
                <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                  {utterance.text}
                </p>
              )}

              {editable && !isEditing && editingIndex === null && (
                <div className="flex shrink-0 flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => beginEdit(originalIndex)}
                    title="編集"
                    className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteUtterance(originalIndex)}
                    title="削除"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
