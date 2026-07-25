/**
 * LETTER page count without pdf.js (no workerSrc — safe in the Vite SPA).
 * Counts `/Type /Page` objects and ignores `/Type /Pages` trees.
 * Adequate for @react-pdf/renderer output used by résumé export.
 */
export function countPdfPagesFromBytes(bytes: Uint8Array): number {
  const s = new TextDecoder("latin1").decode(bytes)
  const re = /\/Type\s*\/Page\b(?!\s*s)/g
  let n = 0
  while (re.exec(s)) n += 1
  return n
}
