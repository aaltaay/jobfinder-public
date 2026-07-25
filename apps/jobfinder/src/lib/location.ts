/** US-focus eligibility for inbox filtering and messaging. */

const DEMO_HOME =
  /\b(demo city|demo suburb|demo port)\b/i
const NEARBY_METRO =
  /\b(demo metro|nearby demo|demo county)\b/i
const REMOTEISH =
  /\b(remote|distributed|work from home|wfh|anywhere)\b/i

/**
 * Lower = closer to Demo City home base for inbox “Distance” sort.
 * Not GPS miles — catalog locations are free text.
 * 0 home metro · 1 nearby metro · 2 remote US · 3 other US metro · 4 unknown
 */
export function homeDistanceRank(job: {
  location?: string | null
  remote_scope?: string | null
  work_arrangement?: string | null
}): number {
  const location = job.location || ""
  const scope = job.remote_scope || ""
  const arrangement = (job.work_arrangement || "").toLowerCase()
  const text = `${location} ${scope} ${arrangement}`

  if (DEMO_HOME.test(location) || DEMO_HOME.test(text)) return 0
  if (NEARBY_METRO.test(location) || NEARBY_METRO.test(text)) return 1

  const remote =
    arrangement === "remote" ||
    REMOTEISH.test(location) ||
    REMOTEISH.test(scope) ||
    REMOTEISH.test(arrangement)
  if (remote && isUsFocusedJob(job)) return 2

  if (isUsFocusedJob(job) && location.trim()) return 3
  return 4
}

const US_POSITIVE =
  /\b(united states|usa\b|u\.s\.a?\.?\b|\bus-|\bus,|, us\b|remote[ -]?us|us[ -]?remote|us only|usa only|demo city|demo suburb|san francisco|new york|nyc|seattle|austin|boston|denver|chicago|atlanta|dallas|los angeles|california|texas|washington|virginia|colorado|florida|georgia|illinois|massachusetts|oregon|pennsylvania|arizona|utah|michigan|ohio|remote[ -]?usa)\b/i

const FOREIGN_ONLY =
  /\b(united kingdom|\buk\b|london|england|scotland|ireland|dublin|germany|berlin|munich|france|paris|netherlands|amsterdam|spain|madrid|italy|sweden|norway|denmark|finland|switzerland|australia|sydney|melbourne|singapore|india|bangalore|bengaluru|hyderabad|mumbai|pune|canada only|toronto|vancouver|montreal|brazil|mexico city|japan|tokyo|emea\b|apac\b|europe only|eu only|remote[ -]?eu|remote[ -]?uk|remote[ -]?emea|remote[ -]?apac|remote[ -]?india|remote[ -]?canada(?![^;]*\bus\b))\b/i

const FOREIGN_CITY_ONSITE =
  /\b(london|berlin|paris|amsterdam|dublin|singapore|bangalore|bengaluru|sydney|toronto|vancouver|munich|stockholm|zurich|tokyo|hyderabad|mumbai)\b/i

export function isUsFocusedJob(job: {
  location?: string | null
  remote_scope?: string | null
  work_arrangement?: string | null
}): boolean {
  const location = (job.location || "").toLowerCase()
  const scope = (job.remote_scope || "").toLowerCase()
  const arrangement = (job.work_arrangement || "").toLowerCase()
  const text = `${location} ${scope} ${arrangement}`

  // Explicit US (including "Remote, Canada; Remote, US")
  if (US_POSITIVE.test(text)) return true

  // Clear foreign-only remote/onsite
  if (FOREIGN_ONLY.test(text) && !US_POSITIVE.test(text)) return false

  // Onsite in foreign cities without US signal
  if (
    (arrangement.includes("onsite") || arrangement.includes("on-site") || !arrangement.includes("remote")) &&
    FOREIGN_CITY_ONSITE.test(location) &&
    !US_POSITIVE.test(text)
  ) {
    return false
  }

  // Remote with no country tags — keep (often US-friendly)
  if (arrangement === "remote" || location.includes("remote")) {
    if (FOREIGN_ONLY.test(text)) return false
    return true
  }

  // Unknown onsite location — keep for now (may be US HQ without country)
  return !FOREIGN_CITY_ONSITE.test(location)
}
