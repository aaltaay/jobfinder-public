/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_DB_SCHEMA: string
  /** Optional Google Drive Picker (OAuth client + API key) */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_API_KEY?: string
  /** Optional GCP project number for Picker setAppId */
  readonly VITE_GOOGLE_APP_ID?: string
}

declare module "html2pdf.js" {
  type Html2PdfWorker = {
    set: (opts: Record<string, unknown>) => Html2PdfWorker
    from: (el: HTMLElement) => Html2PdfWorker
    save: () => Promise<void>
  }
  export default function html2pdf(): Html2PdfWorker
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "*.html?raw" {
  const content: string
  export default content
}
