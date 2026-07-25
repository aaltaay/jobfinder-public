/**
 * Browser smoke: assertOnePageResumePdf + downloadBlob without pdf.js workerSrc.
 * Run: node scripts/smoke_pdf_export.mjs
 */
import { createServer } from "vite"
import { chromium } from "playwright"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const server = await createServer({
  root,
  server: { port: 5199, strictPort: true },
  logLevel: "error",
})
await server.listen()
const base = server.resolvedUrls?.local?.[0] || "http://127.0.0.1:5199/"

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const consoleErrors = []
page.on("pageerror", (e) => consoleErrors.push(String(e)))
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text())
})

await page.goto(base, { waitUntil: "domcontentloaded" })

const result = await page.evaluate(async () => {
  const { DEMO_GENERIC } = await import("/src/lib/resume/demoMaster.ts")
  const { exportResumePdfFromDoc, assertOnePageResumePdf } = await import(
    "/src/lib/resume/exportPdf.tsx"
  )
  try {
    const file = await exportResumePdfFromDoc(DEMO_GENERIC, {
      company: "OpenAI",
      revision: "r3",
    })
    const { bytes, level } = await assertOnePageResumePdf(DEMO_GENERIC)
    return {
      ok: true,
      filename: file.filename,
      urlKind: file.url.slice(0, 5),
      bytes: bytes.byteLength,
      level,
      workerError: false,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      workerError: /workerSrc|GlobalWorkerOptions/i.test(String(e)),
    }
  }
})

await browser.close()
await server.close()

if (!result.ok || result.workerError) {
  console.error("SMOKE FAIL", result, consoleErrors)
  process.exit(1)
}
if (result.filename !== "Jane_Demo_resume_openai_r3.pdf") {
  console.error("SMOKE FAIL bad filename", result)
  process.exit(1)
}
console.log("SMOKE PASS", result)
if (consoleErrors.some((e) => /workerSrc|GlobalWorkerOptions/i.test(e))) {
  console.error("SMOKE FAIL console worker errors", consoleErrors)
  process.exit(1)
}
