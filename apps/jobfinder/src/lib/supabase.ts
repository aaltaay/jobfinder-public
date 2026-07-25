import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anon) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY")
}

export const SCHEMA = import.meta.env.VITE_DB_SCHEMA || "schema_jobfinder"

export const supabase = createClient(url, anon)

export const db = () => supabase.schema(SCHEMA)
