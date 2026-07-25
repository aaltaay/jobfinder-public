/** Import résumé from local/Drive file picker or Google Picker. */

import mammoth from "mammoth"

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function plainTextToResumeHtml(plain: string, name = "Your Name"): string {
  const safeName = name.trim() || "Your Name"
  const paras = plain
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const body =
    paras.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`).join("\n") ||
    "<p>Imported résumé — edit with chat or HTML.</p>"
  return `<article class="resume"><header class="resume-header"><h1>${escapeHtml(safeName)}</h1></header><section><h2>Résumé</h2>${body}</section></article>`
}

function extractNameFromHtml(html: string): string | null {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const name = m?.[1]?.replace(/<[^>]+>/g, "").trim()
  return name || null
}

function normalizeImportedHtml(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) throw new Error("File was empty.")
  if (/<article[\s>]/i.test(trimmed) || /<h1[\s>]/i.test(trimmed)) {
    return trimmed
  }
  // Strip full documents down to body
  const body = trimmed.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] || trimmed
  const textish = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
  if (/<[a-z][\s\S]*>/i.test(textish)) {
    const name = extractNameFromHtml(textish) || "Your Name"
    if (/<h1[\s>]/i.test(textish)) return `<article class="resume">${textish}</article>`
    return `<article class="resume"><header class="resume-header"><h1>${escapeHtml(name)}</h1></header><section>${textish}</section></article>`
  }
  return plainTextToResumeHtml(textish.replace(/<[^>]+>/g, " "))
}

export async function fileToResumeHtml(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith(".docx")) {
    const buf = await file.arrayBuffer()
    const result = await mammoth.convertToHtml({ arrayBuffer: buf })
    const html = result.value?.trim()
    if (!html) throw new Error("Could not read that Word document.")
    return normalizeImportedHtml(html)
  }
  if (name.endsWith(".doc")) {
    throw new Error("Legacy .doc isn’t supported — export/save as .docx, .html, or .txt.")
  }
  if (name.endsWith(".pdf")) {
    throw new Error("PDF import isn’t supported yet — use .docx, .html, or .txt (or paste text).")
  }
  const text = await file.text()
  if (name.endsWith(".html") || name.endsWith(".htm") || /<[a-z][\s\S]*>/i.test(text)) {
    return normalizeImportedHtml(text)
  }
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim()
  return plainTextToResumeHtml(text, base || "Your Name")
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() && import.meta.env.VITE_GOOGLE_API_KEY?.trim(),
  )
}

type TokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string
            scope: string
            callback: (resp: { access_token?: string; error?: string }) => void
          }) => TokenClient
        }
      }
      picker: {
        Action: { PICKED: string; CANCEL: string }
        DocsView: new (viewId?: string) => GoogleDocsView
        ViewId: { DOCS: string }
        PickerBuilder: new () => GooglePickerBuilder
        Response: { ACTION: string; DOCUMENTS: string }
        Document: { ID: string; NAME: string; MIME_TYPE: string }
      }
    }
    gapi?: {
      load: (lib: string, cb: () => void) => void
    }
  }
}

type GooglePickerData = {
  [key: string]: unknown
  action?: string
  docs?: Array<{ id: string; name: string; mimeType?: string }>
}

type GoogleDocsView = {
  setIncludeFolders: (v: boolean) => GoogleDocsView
  setSelectFolderEnabled: (v: boolean) => GoogleDocsView
  setMimeTypes: (m: string) => GoogleDocsView
}

type GooglePickerBuilder = {
  setDeveloperKey: (k: string) => GooglePickerBuilder
  setAppId: (id: string) => GooglePickerBuilder
  setOAuthToken: (t: string) => GooglePickerBuilder
  addView: (v: GoogleDocsView) => GooglePickerBuilder
  setCallback: (cb: (data: GooglePickerData) => void) => GooglePickerBuilder
  build: () => { setVisible: (v: boolean) => void }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement("script")
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

async function ensureGoogleApis(): Promise<void> {
  await loadScript("https://accounts.google.com/gsi/client")
  await loadScript("https://apis.google.com/js/api.js")
  await new Promise<void>((resolve, reject) => {
    if (!window.gapi) {
      reject(new Error("Google API failed to load"))
      return
    }
    window.gapi.load("picker", () => resolve())
  })
}

function requestDriveToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || "Google sign-in was cancelled"))
          return
        }
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken({ prompt: "" })
  })
}

function openPicker(accessToken: string, apiKey: string, appId?: string): Promise<{ id: string; name: string }> {
  return new Promise((resolve, reject) => {
    const view = new window.google!.picker.DocsView(window.google!.picker.ViewId.DOCS)
    view.setIncludeFolders(true)
    view.setSelectFolderEnabled(false)
    view.setMimeTypes(
      [
        "text/html",
        "text/plain",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/vnd.google-apps.document",
      ].join(","),
    )

    const builder = new window.google!.picker.PickerBuilder()
      .setDeveloperKey(apiKey)
      .setOAuthToken(accessToken)
      .addView(view)
      .setCallback((data: GooglePickerData) => {
        const action = String(data[window.google!.picker.Response.ACTION] ?? data.action ?? "")
        if (action === window.google!.picker.Action.CANCEL) {
          reject(new Error("Drive picker cancelled"))
          return
        }
        if (action === window.google!.picker.Action.PICKED) {
          const docs = (data[window.google!.picker.Response.DOCUMENTS] || data.docs) as Array<{
            id: string
            name: string
          }>
          const doc = docs?.[0]
          if (!doc?.id) {
            reject(new Error("No file selected"))
            return
          }
          resolve({ id: doc.id, name: doc.name })
        }
      })

    if (appId) builder.setAppId(appId)
    builder.build().setVisible(true)
  })
}

async function downloadDriveFile(fileId: string, accessToken: string, name: string): Promise<File> {
  const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!metaRes.ok) throw new Error("Could not read Drive file metadata")
  const meta = (await metaRes.json()) as { mimeType?: string; name?: string }
  const mime = meta.mimeType || ""
  const filename = meta.name || name

  let url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
  // Google Docs native → export as docx
  if (mime === "application/vnd.google-apps.document") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )}`
  }

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error("Could not download file from Drive")
  const buf = await res.arrayBuffer()
  let outName = filename
  if (mime === "application/vnd.google-apps.document" && !outName.toLowerCase().endsWith(".docx")) {
    outName = `${outName}.docx`
  }
  return new File([buf], outName, {
    type:
      mime === "application/vnd.google-apps.document"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : mime || "application/octet-stream",
  })
}

/** Opens Google Picker and returns résumé HTML. Requires VITE_GOOGLE_* env vars. */
export async function importResumeFromGoogleDrive(): Promise<string> {
  if (!isGoogleDriveConfigured()) {
    throw new Error("Google Drive isn’t configured for this deployment.")
  }
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID!.trim()
  const apiKey = import.meta.env.VITE_GOOGLE_API_KEY!.trim()
  const appId = import.meta.env.VITE_GOOGLE_APP_ID?.trim() || undefined

  await ensureGoogleApis()
  const token = await requestDriveToken(clientId)
  const picked = await openPicker(token, apiKey, appId)
  const file = await downloadDriveFile(picked.id, token, picked.name)
  return fileToResumeHtml(file)
}
