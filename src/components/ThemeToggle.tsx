'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('echonote-theme');
    if (saved === 'light') {
      setDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('echonote-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('echonote-theme', 'light');
    }
  };

  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      aria-label="テーマ切替"
    >
      {dark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
    </button>
  );
}
