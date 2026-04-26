// カンマ（半角/全角）・読点・句点・各種空白（半角/全角/NBSP/タブ/改行）を区切り文字とする
export const DELIMITER = /[,，、。　 \s]+/u;
export const TRAILING_DELIMITER = /[,，、。　 \s]$/u;

export function splitTokens(value: string): string[] {
  return value
    .split(DELIMITER)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}
