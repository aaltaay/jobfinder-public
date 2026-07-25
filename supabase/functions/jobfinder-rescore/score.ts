/**
 * LEGACY / NON-PRODUCT — frozen catalog keyword scorer (deterministic, no LLM, no I/O).
 *
 * Product ranking is Gatekeeper only (docs/GATEKEEPER.md): gpt-5.6-luna →
 * user_job_state.gatekeeper_score. Inbox MUST NOT sort or display match_score.
 * Kept for offline experiments; ingest must not write meaningful match_score for SPA.
 *
 * Pass a per-user FitProfile when experimenting (profiles.fit_profile / résumé). Max = 100.
 */

export type MatchReason = {
  code: string;
  label: string;
  points: number;
  evidence: string;
};

export type ScoreInput = {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  work_arrangement?: string | null;
  remote_scope?: string | null;
  employment_type?: string | null;
  seniority?: string | null;
  description?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_text?: string | null;
  posted_at?: string | null;
};

export type FitProfile = {
  name: string;
  years: number;
  home: string;
  target_titles: string[];
  strong_tech: string[];
  adjacent_tech: string[];
  domain: string[];
  red_flags: string[];
};

export const SCORE_WEIGHTS = {
  location: 30,
  seniority: 15,
  title: 15,
  technology: 15,
  experience: 10,
  salary: 5,
  posting_age: 5,
  employment_type: 5,
} as const;

/** Default / seed profile (demo) — used only when a user has no fit_profile yet. */
export const DEFAULT_FIT_PROFILE: FitProfile = {
  name: "Jane Demo",
  years: 7,
  home: "Austin, TX",
  target_titles: [
    "senior software engineer",
    "staff software engineer",
    "senior systems engineer",
    "senior embedded",
    "embedded software engineer",
    "systems engineer",
    "software / systems engineer",
    "platform engineer",
    "controls software",
    "senior backend",
    "developer tools",
    "software architect",
    "firmware engineer",
    "senior firmware",
  ],
  strong_tech: [
    "c++",
    "c/c++",
    " python",
    "python ",
    "embedded",
    "systems",
    "controls",
    "modbus",
    "bacnet",
    "can bus",
    "docker",
    "flask",
    "node.js",
    "nodejs",
    " sql",
    "ci/cd",
    "devops",
    "hil",
    "hardware-in-the-loop",
    "hardware in the loop",
    "plc",
    "system architecture",
    "api design",
  ],
  adjacent_tech: [
    "c#",
    "javascript",
    "typescript",
    "react",
    "bluetooth",
    "ble",
    "siemens",
    "rockwell",
    "linux",
    "firmware",
    "iot",
    "mqtt",
    "rtos",
    "test automation",
    "requirements",
    "golang",
    "rust",
  ],
  domain: [
    "hvac",
    "building controls",
    "building automation",
    "industrial",
    "commissioning",
    "requirements management",
    "traceability",
    "connected devices",
    "edge computing",
    "controls product",
    "ot ",
    "scada",
  ],
  red_flags: ["intern", "internship", "junior", "new grad", "new-grad", "entry level", "entry-level"],
};

/** @deprecated use DEFAULT_FIT_PROFILE */
export const CANDIDATE = DEFAULT_FIT_PROFILE;

let ACTIVE_PROFILE: FitProfile = DEFAULT_FIT_PROFILE;

const TRIANGLE = ["raleigh", "durham", "chapel hill", "cary", "rtp", "research triangle"];
const CHARLOTTE = ["charlotte"];
const NEARBY_ONSITE = ["greensboro", "winston-salem", "wilmington", "asheville"];

function lower(value?: string | null): string {
  return (value ?? "").toLowerCase().trim();
}

function haystack(input: ScoreInput): string {
  return [
    input.title,
    input.company,
    input.location,
    input.work_arrangement,
    input.remote_scope,
    input.employment_type,
    input.seniority,
    input.description,
    input.salary_text,
  ]
    .map(lower)
    .join(" ");
}

function findHits(text: string, keywords: readonly string[]): string[] {
  const hits: string[] = [];
  for (const k of keywords) {
    const needle = k.trim().toLowerCase();
    if (!needle) continue;
    if (needle === "c++") {
      if (/(?:^|[^a-z])c\+\+(?:[^a-z]|$)/.test(text) || text.includes("cpp")) hits.push("c++");
      continue;
    }
    if (text.includes(needle)) hits.push(needle);
  }
  return [...new Set(hits)];
}

function scoreLocation(input: ScoreInput): MatchReason {
  const arrangement = lower(input.work_arrangement);
  const scope = lower(input.remote_scope);
  const location = lower(input.location);
  const text = `${arrangement} ${scope} ${location}`;

  const isRemote =
    arrangement === "remote" ||
    text.includes("remote") ||
    scope.includes("remote") ||
    location.includes("remote");
  const isHybrid = arrangement === "hybrid" || text.includes("hybrid");
  const isOnsite = arrangement === "onsite" || arrangement === "on-site" || text.includes("onsite");

  const usPositive =
    /\b(united states|usa\b|u\.s\.|\bus-|\bus,|, us\b|remote[ -]?us|us[ -]?remote|us only|raleigh|durham|chapel hill|charlotte|san francisco|new york|nyc|seattle|austin|boston|north carolina)\b/.test(
      text,
    );

  const foreignOnly =
    /\b(united kingdom|\buk\b|london|england|germany|berlin|france|paris|netherlands|amsterdam|ireland|dublin|india|bangalore|singapore|australia|sydney|emea\b|apac\b|europe only|eu only|remote[ -]?eu|remote[ -]?uk|remote[ -]?emea|toronto|vancouver|canada only)\b/.test(
      text,
    ) && !usPositive;

  const usEligible =
    usPositive ||
    scope.includes("north america") ||
    (isRemote && !foreignOnly && (scope.includes("worldwide") || scope.includes("anywhere") || !scope));

  if (foreignOnly) {
    return {
      code: "location_non_us",
      label: "Outside USA focus",
      points: 0,
      evidence: input.location || input.remote_scope || "non-US location",
    };
  }

  const geoBlocked =
    isRemote &&
    /(uk only|eu only|emea only|india only|apac only|europe only|canada only)/.test(text) &&
    !usEligible;

  if (geoBlocked) {
    return {
      code: "location_geo_blocked",
      label: "Remote but geo-restricted (not US)",
      points: 0,
      evidence: input.remote_scope || input.location || "geo restriction detected",
    };
  }

  if (isRemote && usEligible) {
    if (
      scope.includes("north america") &&
      !scope.includes("us") &&
      !scope.includes("united states") &&
      !scope.includes("usa")
    ) {
      return {
        code: "location_remote_na",
        label: "Remote North America (US-eligible)",
        points: 26,
        evidence: input.remote_scope || input.location || "remote NA",
      };
    }
    return {
      code: "location_remote_us",
      label: "Fully remote (US-eligible)",
      points: 30,
      evidence: input.remote_scope || input.location || "remote US",
    };
  }

  if (isHybrid && TRIANGLE.some((city) => location.includes(city))) {
    return {
      code: "location_hybrid_triangle",
      label: "Hybrid Triangle — matches Raleigh home base",
      points: 28,
      evidence: input.location || "Triangle hybrid",
    };
  }

  if (isHybrid && CHARLOTTE.some((city) => location.includes(city))) {
    return {
      code: "location_hybrid_charlotte",
      label: "Hybrid Charlotte — near home base",
      points: 20,
      evidence: input.location || "Charlotte hybrid",
    };
  }

  if ((isOnsite || isHybrid) && NEARBY_ONSITE.some((city) => location.includes(city))) {
    return {
      code: "location_nearby_onsite",
      label: "Nearby NC onsite — home market",
      points: 20,
      evidence: input.location || "nearby onsite",
    };
  }

  if (isRemote) {
    return {
      code: "location_remote_unclear",
      label: "Remote eligibility unclear",
      points: 10,
      evidence: input.remote_scope || input.location || "remote",
    };
  }

  return {
    code: "location_low",
    label: "Location fit is weak vs Raleigh / remote preference",
    points: 0,
    evidence: input.location || arrangement || "unknown location",
  };
}

function scoreSeniority(input: ScoreInput): MatchReason {
  const text = `${lower(input.seniority)} ${lower(input.title)} ${lower(input.description)}`;
  if (ACTIVE_PROFILE.red_flags.some((f) => text.includes(f))) {
    return {
      code: "seniority_junior",
      label: "Junior/entry — poor resume fit",
      points: 0,
      evidence: input.seniority || input.title || "junior",
    };
  }
  if (/(staff|principal|distinguished|architect)/.test(text)) {
    return {
      code: "seniority_staff",
      label: "Staff/Principal/Architect — strong resume match",
      points: 15,
      evidence: input.seniority || input.title || "staff+",
    };
  }
  if (/(senior|sr\.|lead)/.test(text)) {
    return {
      code: "seniority_senior",
      label: `Senior level — matches ${ACTIVE_PROFILE.years}+ yr IC track`,
      points: 15,
      evidence: input.seniority || input.title || "senior",
    };
  }
  if (/(mid-level|mid level|intermediate)/.test(text)) {
    return {
      code: "seniority_mid",
      label: "Mid-level (partial vs resume)",
      points: 6,
      evidence: input.seniority || input.title || "mid",
    };
  }
  return {
    code: "seniority_unknown",
    label: "Seniority unspecified",
    points: 8,
    evidence: "unspecified",
  };
}

function scoreTitle(input: ScoreInput): MatchReason {
  const title = lower(input.title);
  if (ACTIVE_PROFILE.target_titles.some((t) => title.includes(t))) {
    return {
      code: "title_exact",
      label: "Target title for your profile",
      points: 15,
      evidence: input.title || title,
    };
  }
  if (
    /(software engineer|software developer|fullstack|full stack|backend|platform engineer|systems engineer|embedded|firmware|controls engineer)/.test(
      title,
    )
  ) {
    return {
      code: "title_related",
      label: "Related engineering title",
      points: 10,
      evidence: input.title || title,
    };
  }
  if (/(engineer|developer)/.test(title)) {
    return {
      code: "title_weak",
      label: "Broad engineering title",
      points: 5,
      evidence: input.title || title,
    };
  }
  return {
    code: "title_miss",
    label: "Title outside resume target set",
    points: 0,
    evidence: input.title || "unknown",
  };
}

function scoreTechnology(input: ScoreInput): MatchReason {
  const text = ` ${haystack(input)} `;
  const strong = findHits(text, ACTIVE_PROFILE.strong_tech);
  const adjacent = findHits(text, ACTIVE_PROFILE.adjacent_tech);
  const domain = findHits(text, ACTIVE_PROFILE.domain);

  if (strong.length >= 3 || (strong.length >= 2 && domain.length >= 1)) {
    return {
      code: "resume_stack_strong",
      label: "Strong resume stack match",
      points: 15,
      evidence: [...strong, ...domain].slice(0, 6).join(", "),
    };
  }
  if (strong.length >= 1) {
    const pts = domain.length ? 12 : 10;
    return {
      code: "resume_stack_partial",
      label: "Partial resume stack match",
      points: pts,
      evidence: [...strong, ...adjacent.slice(0, 2), ...domain].slice(0, 6).join(", "),
    };
  }
  if (adjacent.length >= 2 || domain.length >= 1) {
    return {
      code: "resume_stack_adjacent",
      label: "Adjacent / domain signals vs resume",
      points: 7,
      evidence: [...adjacent, ...domain].slice(0, 6).join(", "),
    };
  }
  return {
    code: "resume_stack_none",
    label: "Weak stack overlap with your resume",
    points: 0,
    evidence: "no strong tech or domain hits",
  };
}

function scoreExperience(input: ScoreInput): MatchReason {
  const text = haystack(input);
  const yearsMatch = text.match(/(\d+)\+?\s*years?/);
  const ownership =
    /(architect|owned|end-to-end|full.?stack ownership|led |initiated|system design|sdlc)/.test(text);

  if (yearsMatch) {
    const years = Number(yearsMatch[1]);
    if (years >= 5 && years <= 12) {
      return {
        code: "exp_aligned",
        label: `Experience band aligned with ${ACTIVE_PROFILE.years}+ yr resume`,
        points: ownership ? 10 : 9,
        evidence: `${years} years${ownership ? "; ownership/architect signal" : ""}`,
      };
    }
    if (years >= 3 && years < 5) {
      return {
        code: "exp_low",
        label: "Experience slightly below resume band",
        points: 5,
        evidence: `${years} years`,
      };
    }
    if (years > 12) {
      return {
        code: "exp_high",
        label: "Experience above typical band",
        points: 7,
        evidence: `${years} years`,
      };
    }
  }
  if (ownership || /(5\+|7\+|senior experience|significant experience)/.test(text)) {
    return {
      code: "exp_signal",
      label: "Senior/architect ownership signal",
      points: 8,
      evidence: "qualitative ownership match",
    };
  }
  return {
    code: "exp_unknown",
    label: "Experience not specified",
    points: 5,
    evidence: "unspecified",
  };
}

function scoreSalary(input: ScoreInput): MatchReason {
  const min = input.salary_min ?? null;
  const max = input.salary_max ?? null;
  const text = lower(input.salary_text);
  const sixFigure =
    (min !== null && min >= 100000) ||
    (max !== null && max >= 100000) ||
    /\$?\s*1[0-9]{2,}[,k]|\$\s*[1-9]\d{2}k|[1-9]\d{2},\d{3}/.test(text);

  if (sixFigure) {
    return {
      code: "salary_boost",
      label: "Six-figure salary signal",
      points: 5,
      evidence: input.salary_text || String(max ?? min),
    };
  }
  return {
    code: "salary_unknown",
    label: "Salary not provided (no penalty)",
    points: 0,
    evidence: "missing",
  };
}

function scorePostingAge(input: ScoreInput): MatchReason {
  if (!input.posted_at) {
    return { code: "age_unknown", label: "Posting age unknown", points: 2, evidence: "missing posted_at" };
  }
  const posted = Date.parse(input.posted_at);
  if (!Number.isFinite(posted)) {
    return { code: "age_invalid", label: "Posting age invalid", points: 2, evidence: input.posted_at };
  }
  const days = (Date.now() - posted) / (1000 * 60 * 60 * 24);
  if (days <= 7) {
    return { code: "age_fresh", label: "Posted within 7 days", points: 5, evidence: `${Math.floor(days)}d` };
  }
  if (days <= 21) {
    return { code: "age_recent", label: "Posted within 21 days", points: 3, evidence: `${Math.floor(days)}d` };
  }
  if (days <= 45) {
    return { code: "age_aging", label: "Posted within 45 days", points: 1, evidence: `${Math.floor(days)}d` };
  }
  return { code: "age_stale", label: "Older posting", points: 0, evidence: `${Math.floor(days)}d` };
}

function scoreEmploymentType(input: ScoreInput): MatchReason {
  const text = `${lower(input.employment_type)} ${lower(input.title)} ${lower(input.description)}`;
  if (/(full[- ]?time|permanent|fte)/.test(text)) {
    return {
      code: "emp_fulltime",
      label: "Full-time role",
      points: 5,
      evidence: input.employment_type || "full-time",
    };
  }
  if (/(contract|c2h|temp|freelance|part[- ]?time)/.test(text)) {
    return {
      code: "emp_contract",
      label: "Contract/part-time",
      points: 1,
      evidence: input.employment_type || "contract",
    };
  }
  return {
    code: "emp_unknown",
    label: "Employment type unspecified",
    points: 3,
    evidence: "unspecified",
  };
}

/** Qualitative band for UI — derived from total score + resume stack code. */
export function fitBand(score: number, reasons: MatchReason[]): {
  band: "exceptional" | "strong" | "fair" | "weak";
  label: string;
} {
  const stack = reasons.find((r) => r.code.startsWith("resume_stack_"));
  if (score >= 80 && stack && stack.points >= 12) {
    return { band: "exceptional", label: "Exceptional fit for your resume" };
  }
  if (score >= 65) return { band: "strong", label: "Strong fit for your resume" };
  if (score >= 45) return { band: "fair", label: "Fair fit — review carefully" };
  return { band: "weak", label: "Weak fit vs your resume" };
}

export function scoreJobForProfile(
  input: ScoreInput,
  profile: FitProfile = DEFAULT_FIT_PROFILE,
): { match_score: number; match_reasons: MatchReason[] } {
  const prev = ACTIVE_PROFILE;
  ACTIVE_PROFILE = normalizeFitProfile(profile);
  try {
    const reasons = [
      scoreLocation(input),
      scoreSeniority(input),
      scoreTitle(input),
      scoreTechnology(input),
      scoreExperience(input),
      scoreSalary(input),
      scorePostingAge(input),
      scoreEmploymentType(input),
    ];
    const match_score = reasons.reduce((sum, r) => sum + r.points, 0);
    const band = fitBand(match_score, reasons);
    reasons.push({
      code: `fit_band_${band.band}`,
      label: band.label,
      points: 0,
      evidence: `Scored ${match_score}/100 against ${ACTIVE_PROFILE.name} profile (${ACTIVE_PROFILE.years}+ yrs, ${ACTIVE_PROFILE.home})`,
    });
    return { match_score, match_reasons: reasons };
  } finally {
    ACTIVE_PROFILE = prev;
  }
}

export function normalizeFitProfile(raw: Partial<FitProfile> | null | undefined): FitProfile {
  const d = DEFAULT_FIT_PROFILE;
  if (!raw || typeof raw !== "object") return d;
  return {
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : "Candidate",
    years: Number.isFinite(Number(raw.years)) ? Number(raw.years) : d.years,
    home: typeof raw.home === "string" && raw.home.trim() ? raw.home.trim() : "",
    target_titles: Array.isArray(raw.target_titles) && raw.target_titles.length
      ? raw.target_titles.map(String)
      : d.target_titles,
    strong_tech: Array.isArray(raw.strong_tech) && raw.strong_tech.length
      ? raw.strong_tech.map(String)
      : d.strong_tech,
    adjacent_tech: Array.isArray(raw.adjacent_tech) ? raw.adjacent_tech.map(String) : d.adjacent_tech,
    domain: Array.isArray(raw.domain) ? raw.domain.map(String) : d.domain,
    red_flags: Array.isArray(raw.red_flags) && raw.red_flags.length
      ? raw.red_flags.map(String)
      : d.red_flags,
  };
}

export function scoreJob(input: ScoreInput): { match_score: number; match_reasons: MatchReason[] } {
  return scoreJobForProfile(input, DEFAULT_FIT_PROFILE);
}

/** Derive a coarse FitProfile from plain résumé text (HTML stripped). */
export function deriveFitProfileFromText(text: string, displayName?: string | null): FitProfile {
  const t = (text || "").toLowerCase();
  const name =
    (displayName || "").trim() ||
    (text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m)?.[1] ?? "Candidate");

  const yearsMatch = t.match(/(\d+)\+?\s*years?/);
  const years = yearsMatch ? Number(yearsMatch[1]) : 5;

  const homeMatch = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/,
  );
  const home = homeMatch ? `${homeMatch[1]}, ${homeMatch[2]}` : "";

  const lexicon = {
    strong_tech: DEFAULT_FIT_PROFILE.strong_tech,
    adjacent_tech: DEFAULT_FIT_PROFILE.adjacent_tech,
    domain: DEFAULT_FIT_PROFILE.domain,
    target_titles: DEFAULT_FIT_PROFILE.target_titles,
  };

  const pick = (list: string[]) => list.filter((k) => t.includes(k.trim().toLowerCase()));

  const strong = pick([...lexicon.strong_tech]);
  const adjacent = pick([...lexicon.adjacent_tech]);
  const domain = pick([...lexicon.domain]);
  const titles = pick([...lexicon.target_titles]);

  return normalizeFitProfile({
    name,
    years: Number.isFinite(years) ? years : 5,
    home,
    strong_tech: strong.length ? strong : DEFAULT_FIT_PROFILE.strong_tech.slice(0, 8),
    adjacent_tech: adjacent,
    domain,
    target_titles: titles.length ? titles : DEFAULT_FIT_PROFILE.target_titles.slice(0, 6),
    red_flags: DEFAULT_FIT_PROFILE.red_flags,
  });
}
