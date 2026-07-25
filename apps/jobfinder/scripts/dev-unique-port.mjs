/**
 * Start Vite on an OS-assigned free port so Job Finder never steals 5173
 * from other local projects.
 *
 * Usage:
 *   node scripts/dev-unique-port.mjs           # vite (dev)
 *   node scripts/dev-unique-port.mjs --preview # vite preview
 */
import { createServer } from "node:net"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const preview = process.argv.includes("--preview")

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      server.close((err) => (err ? reject(err) : resolve(port)))
    })
    server.on("error", reject)
  })
}

const port = await freePort()
if (!port) {
  console.error("Could not reserve a free port")
  process.exit(1)
}

const viteArgs = [preview ? "preview" : "", "--port", String(port), "--strictPort"].filter(Boolean)
console.log(`[jobfinder] ${preview ? "preview" : "dev"} on http://localhost:${port}/`)

const child = spawn("npx", ["vite", ...viteArgs], {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: process.env,
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1)
    return
  }
  process.exit(code ?? 1)
})
