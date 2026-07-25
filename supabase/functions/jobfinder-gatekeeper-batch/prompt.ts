/**
 * SYNC: Keep rubric body aligned with
 * apps/jobfinder/config/gatekeeper/system_prompt.md
 * and docs/GATEKEEPER.md.
 */
export const GATEKEEPER_SYSTEM_PROMPT = `# GATEKEEPER — Resume-to-Job-Description Scoring Agent

You are Gatekeeper, a resume-screening simulation agent. Your job is to score how well a candidate's resume matches a specific job description (JD), the way a real recruiter or hiring-team screener would in a 30–60 second review — not the way a sympathetic career coach would.

You are calibrated to be honest, conservative, and decision-oriented. Your output exists to answer one question: is applying to this role a good use of the candidate's time, and if so, what tailoring maximizes the odds?

## INPUTS

- RESUME (required)
- JOB DESCRIPTION full posting (required) — do not score from title alone
- Optional CANDIDATE NOTES — may adjust Logistics gate + tailoring only; NEVER raise dimension scores

## CORE PRINCIPLES

- Score the paper, not the person
- Gates before fit
- 30-second test
- Required ≠ preferred (required misses cost ~3×)
- Adjacent partial, orthogonal zero
- No grade inflation
- Competition-aware (flag in verdict; don't silently adjust scores)

## STAGE 1 — HARD GATES (any FAIL caps final at 3.0/10)

1 Domain, 2 Scale, 3 Stack, 4 Logistics

Report all four even if one fails. Format: PASS / FAIL / PASS w/ NOTE + one sentence each.

## STAGE 2 — WEIGHTED FIT (0–10)

- D1 Domain Overlap 30%
- D2 Hard Skills Match 25% (required×3 + preferred×1 coverage)
- D3 Seniority & Scope 20%
- D4 Evidence Quality 15%
- D5 Keyword/ATS Coverage 10%

Final = weighted sum; if any gate failed Final = min(Final, 3.0); round to 1 decimal; never round up across thresholds.

## EVIDENCE RULES

Explicit > implied; recency discount 7+ years half; skills-section-only half; no potential credit.

## VERDICTS

- 8.0–10 PRIORITY APPLY
- 6.0–7.9 APPLY WITH TAILORING
- 4.0–5.9 CONDITIONAL
- 0–3.9 SKIP

## RUNTIME OUTPUT (REQUIRED)

Respond with a single JSON object matching the schema. No prose outside JSON.
If any Stage 1 gate is FAIL, the final score MUST be ≤ 3.0.
If score < 4.0, tailoring_plan MUST be an empty array.
Do not invent employers, degrees, or metrics absent from the resume.
`;

const gateObj = {
  type: "object",
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["PASS", "FAIL", "PASS w/ NOTE"] },
    justification: { type: "string" },
  },
  required: ["status", "justification"],
} as const;

const dimObj = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    score: { type: "number" },
    weight: { type: "number" },
    contribution: { type: "number" },
    justification: { type: "string" },
  },
  required: ["name", "score", "weight", "contribution", "justification"],
} as const;

/** Anthropic tool schema (fallback path). */
export const SUBMIT_TOOL = {
  name: "submit_gatekeeper_assessment",
  description: "Submit the complete Gatekeeper assessment as structured JSON.",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "number" },
      verdict: {
        type: "string",
        enum: [
          "PRIORITY APPLY",
          "APPLY WITH TAILORING",
          "CONDITIONAL",
          "SKIP",
        ],
      },
      bottom_line: { type: "string" },
      gates: {
        type: "object",
        properties: {
          domain: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["PASS", "FAIL", "PASS w/ NOTE"],
              },
              justification: { type: "string" },
            },
            required: ["status", "justification"],
          },
          scale: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["PASS", "FAIL", "PASS w/ NOTE"],
              },
              justification: { type: "string" },
            },
            required: ["status", "justification"],
          },
          stack: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["PASS", "FAIL", "PASS w/ NOTE"],
              },
              justification: { type: "string" },
            },
            required: ["status", "justification"],
          },
          logistics: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["PASS", "FAIL", "PASS w/ NOTE"],
              },
              justification: { type: "string" },
            },
            required: ["status", "justification"],
          },
        },
        required: ["domain", "scale", "stack", "logistics"],
      },
      dimensions: {
        type: "object",
        properties: {
          D1: {
            type: "object",
            properties: {
              name: { type: "string" },
              score: { type: "number" },
              weight: { type: "number" },
              contribution: { type: "number" },
              justification: { type: "string" },
            },
            required: ["score", "weight", "contribution", "justification"],
          },
          D2: {
            type: "object",
            properties: {
              name: { type: "string" },
              score: { type: "number" },
              weight: { type: "number" },
              contribution: { type: "number" },
              justification: { type: "string" },
            },
            required: ["score", "weight", "contribution", "justification"],
          },
          D3: {
            type: "object",
            properties: {
              name: { type: "string" },
              score: { type: "number" },
              weight: { type: "number" },
              contribution: { type: "number" },
              justification: { type: "string" },
            },
            required: ["score", "weight", "contribution", "justification"],
          },
          D4: {
            type: "object",
            properties: {
              name: { type: "string" },
              score: { type: "number" },
              weight: { type: "number" },
              contribution: { type: "number" },
              justification: { type: "string" },
            },
            required: ["score", "weight", "contribution", "justification"],
          },
          D5: {
            type: "object",
            properties: {
              name: { type: "string" },
              score: { type: "number" },
              weight: { type: "number" },
              contribution: { type: "number" },
              justification: { type: "string" },
            },
            required: ["score", "weight", "contribution", "justification"],
          },
        },
        required: ["D1", "D2", "D3", "D4", "D5"],
      },
      missing_required: { type: "array", items: { type: "string" } },
      tailoring_plan: { type: "array", items: { type: "string" } },
      honest_addendum: { type: "string" },
      raw_markdown: { type: "string" },
    },
    required: [
      "score",
      "verdict",
      "bottom_line",
      "gates",
      "dimensions",
      "missing_required",
      "tailoring_plan",
      "honest_addendum",
      "raw_markdown",
    ],
  },
} as const;

export const ASSESSMENT_JSON_SCHEMA = {
  name: "gatekeeper_assessment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      score: { type: "number" },
      verdict: {
        type: "string",
        enum: [
          "PRIORITY APPLY",
          "APPLY WITH TAILORING",
          "CONDITIONAL",
          "SKIP",
        ],
      },
      bottom_line: { type: "string" },
      gates: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: gateObj,
          scale: gateObj,
          stack: gateObj,
          logistics: gateObj,
        },
        required: ["domain", "scale", "stack", "logistics"],
      },
      dimensions: {
        type: "object",
        additionalProperties: false,
        properties: {
          D1: dimObj,
          D2: dimObj,
          D3: dimObj,
          D4: dimObj,
          D5: dimObj,
        },
        required: ["D1", "D2", "D3", "D4", "D5"],
      },
      missing_required: { type: "array", items: { type: "string" } },
      tailoring_plan: { type: "array", items: { type: "string" } },
      honest_addendum: { type: "string" },
      raw_markdown: { type: "string" },
    },
    required: [
      "score",
      "verdict",
      "bottom_line",
      "gates",
      "dimensions",
      "missing_required",
      "tailoring_plan",
      "honest_addendum",
      "raw_markdown",
    ],
  },
} as const;
