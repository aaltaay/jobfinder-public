import { chromium } from "playwright"

const BASE = process.env.JOBFINDER_URL || "https://jobs.example.com"
const PASS = process.env.JOBFINDER_PASSWORD || "123456"

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
const errors = []
const apiCalls = []
page.on("pageerror", (e) => errors.push(String(e)))
page.on("response", async (res) => {
  const url = res.url()
  if (url.includes("supabase") || url.includes("schema_jobfinder") || url.includes("/rest/")) {
    apiCalls.push({ status: res.status(), url: url.slice(0, 180) })
  }
})

await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 60000 })
await page.waitForSelector("text=Job Finder", { timeout: 15000 })
console.log("1. login page ok")

await page.fill('input[type="email"]', process.env.JOBFINDER_EMAIL || "demo@example.com")
await page.fill('input[type="password"]', PASS)
await page.click('button[type="submit"]')

// Wait for pathname /jobs (not hostname containing "jobs")
await page.waitForFunction(() => location.pathname.startsWith("/jobs"), null, { timeout: 25000 })
console.log("2. signed in", page.url(), "path", new URL(page.url()).pathname)

await page.waitForSelector("text=listings", { timeout: 20000 })
await page.waitForTimeout(2000)
const header = await page.locator("header p").first().textContent()
console.log("3. inbox", header)
console.log("api sample", apiCalls.slice(0, 12))

const bodyText = await page.locator("body").innerText()
if (bodyText.includes("Failed to load") || bodyText.includes("JWT") || bodyText.includes("permission")) {
  console.log("error text:", bodyText.slice(0, 800))
}

if (!/\d+\s+listings/.test(header || "") || /^0 listings/.test(header || "")) {
  // dump local storage session clues
  const session = await page.evaluate(() => Object.keys(localStorage))
  console.log("localStorage keys", session)
  throw new Error("Expected non-zero listings, got: " + header)
}

await page.waitForSelector("text=Open employer application", { timeout: 15000 })
const apply = page.locator("a", { hasText: "Open employer application" })
const href = await apply.getAttribute("href")
console.log("4. apply href", href)
if (!href?.startsWith("https://")) throw new Error("Missing https apply URL")

const detailStatus = page.locator("section").last().locator("select").first()
await detailStatus.selectOption("interested")
await page.waitForTimeout(1500)
console.log("5. status -> interested")

const notes = page.locator("textarea").first()
await notes.fill("E2E verified " + new Date().toISOString())
await notes.blur()
await page.waitForTimeout(1000)
console.log("6. notes saved")

if (errors.length) {
  console.error("page errors", errors)
  process.exit(1)
}

console.log("E2E PASS")
await browser.close()
