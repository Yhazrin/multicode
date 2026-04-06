/**
 * Copy markdown content to the clipboard.
 * Returns true on success, false on failure.
 */
export async function copyMarkdown(markdown: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(markdown); return true; } catch { return false; }
}
