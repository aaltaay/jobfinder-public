import type { ResumeDocument } from "./schema"

/**
 * Hand-authored Master structured résumé for demo candidate.
 * Demo HVAC baseline aligned to Downloads/jane_demo_resume.pdf (2026-07-18);
 * independent projects retained from prior Master (not in that PDF).
 */
export const DEMO_MASTER: ResumeDocument = {
  version: 1,
  identity: {
    name: "Jane Demo",
    location: "Demo City, TX",
    phone: "+1 (555) 010-0200",
    email: "jane.demo@example.com",
    links: [{ label: "GitHub", url: "https://github.com/jane-demo" }],
  },
  summary:
    "Software engineer with 7+ years at Demo HVAC Co turning manual engineering work into closed-loop automation. Self-initiated and built a pipeline running issue triage, test generation, and PR drafting as connected, self-checking stages, gated by human approval with a full audit trail, plus a self-healing layer keeping build and release running unattended. Also known for a weekend-built fix to a multi-year workflow gap, and for architect-level ownership of production systems: a hardware-in-the-loop test environment that cut setup time 95% and a database tool rebuild adopted team-wide. Independently ships AI and full-stack systems — platforms that provision, retrieve, and alert on their own.",
  skill_groups: [
    {
      id: "sg-lang",
      label: "Languages",
      items: [
        "Python",
        "C++",
        "C",
        "C#",
        "SQL",
        "TypeScript",
        "JavaScript (Node.js)",
      ],
    },
    {
      id: "sg-arch",
      label: "Architecture & Systems",
      items: [
        "closed-loop automation design",
        "agent-orchestrated pipelines",
        "human-in-the-loop workflow design",
        "System architecture design",
        "CI/CD pipelines",
        "API design",
        "embedded controls",
        "hardware-in-the-loop (HiL) testing",
        "database design",
        "cloud migration",
        "platform/provisioning pipelines",
      ],
    },
    {
      id: "sg-tools",
      label: "Tools & Platforms",
      items: [
        "Docker",
        "Git",
        "Flask",
        "Node.js",
        "Siemens PLC",
        "Rockwell",
        "Danfoss",
        "Allen-Bradley",
        "Modbus",
        "BACnet",
        "CAN",
        "CCN",
        "React",
        "Vite",
        "FastAPI",
        "Supabase",
        "Postgres + RLS",
        "Vercel",
        "Railway",
        "Electron",
        "GitHub Actions",
      ],
    },
    {
      id: "sg-ai",
      label: "AI / Data",
      items: [
        "RAG",
        "vector search (Pinecone)",
        "LLM APIs (Gemini)",
        "embedding pipelines",
        "rate-limited service design",
      ],
    },
    {
      id: "sg-prac",
      label: "Practices",
      items: [
        "Agile/Scrum",
        "DevOps",
        "requirements engineering",
        "test plan design & execution",
        "HCI/UX design",
        "technical documentation",
      ],
    },
  ],
  roles: [
    {
      id: "role-carrier",
      title: "Software Engineering",
      company: "Demo HVAC Co",
      start: "2019",
      end: "Present",
      bullets: [
        {
          id: "b-carrier-1",
          text: "Design, develop, test, and release production software in Python and C++ for connected HVAC controls—owning embedded product features and the automation tooling around them through the full software development lifecycle.",
          source_fact_ids: ["f-carrier-cpp", "f-carrier-python"],
        },
        {
          id: "b-carrier-2",
          text: "Serve as de facto software architect for the team: redesigned system architectures, data pipelines, and build/release workflows now adopted as standard practice across several projects.",
          source_fact_ids: ["f-carrier-arch"],
        },
        {
          id: "b-carrier-3",
          text: "Author software design documents, test plans, procedures, and reports; drive gathering of functional and non-functional requirements and conduct customer walkthroughs to keep programs on schedule.",
          source_fact_ids: ["f-carrier-reqs"],
        },
        {
          id: "b-carrier-4",
          text: "Collaborate with globally distributed engineering teams to align software and controls design across product lines.",
          source_fact_ids: ["f-carrier-collab"],
        },
        {
          id: "b-carrier-5",
          text: "Support sustaining product development for deployed products: streamlined issue reporting and triage workflows, enabling faster resolution of customer-reported issues and improving customer satisfaction.",
          source_fact_ids: ["f-carrier-sustain"],
        },
      ],
      projects: [
        {
          id: "p-loop",
          name: "Closed-Loop Engineering Automation",
          tech: [],
          bullets: [
            {
              id: "b-p-loop-1",
              text: "Designed and built a closed-loop automation pipeline running issue triage, test generation, and PR drafting as connected, self-checking stages — gated by human approval with a full audit trail.",
              source_fact_ids: ["f-carrier-loop-pipeline"],
            },
            {
              id: "b-p-loop-2",
              text: "Built a self-healing layer keeping routine build, test, and release operations running unattended, catching and fixing failures before they reach a person.",
              source_fact_ids: ["f-carrier-selfheal"],
            },
            {
              id: "b-p-loop-3",
              text: "Self-initiated the program on personal time, including a weekend-built fix for a years-old workflow gap, then moved the tooling onto company infrastructure.",
              source_fact_ids: ["f-carrier-weekend-fix", "f-carrier-self-initiated"],
            },
          ],
        },
        {
          id: "p-hil",
          name: "Virtual HiL Environment",
          tech: ["Python", "HiL"],
          bullets: [
            {
              id: "b-p-hil",
              text: "Created a Python-based virtual hardware-in-the-loop system enabling hardware verification without physical test rigs, cutting test setup time by 95%.",
              source_fact_ids: ["f-metric-95", "f-carrier-python"],
            },
          ],
        },
        {
          id: "p-test",
          name: "Engineering Test & Commissioning Suite",
          tech: ["Python", "automation"],
          bullets: [
            {
              id: "b-p-test",
              text: "Designed and built a Python testing suite that automates commissioning workflows and application/fault detection, reducing commissioning and verification time by 60%.",
              source_fact_ids: ["f-metric-60", "f-carrier-python"],
            },
          ],
        },
        {
          id: "p-db",
          name: "Database Tool Modernization",
          tech: ["C++", "SQL", "data pipelines"],
          bullets: [
            {
              id: "b-p-db",
              text: "Initiated and architected a ground-up recreation of the team's core database tool in C++, redesigning the data model and processing pipeline; eliminated ~6 hours of manual work per week for 20+ engineers.",
              source_fact_ids: ["f-metric-6h", "f-metric-20eng", "f-carrier-cpp"],
            },
          ],
        },
        {
          id: "p-reqs",
          name: "Requirements Management Platform",
          tech: ["traceability"],
          bullets: [
            {
              id: "b-p-reqs",
              text: "Initiated and architected requirements management software providing end-to-end traceability from specification through verification, replacing a manual process across multiple teams.",
              source_fact_ids: ["f-carrier-reqs-platform"],
            },
          ],
        },
      ],
    },
    {
      id: "role-indie",
      title: "Independent Software Builder",
      company: "Demo Studio / Personal Projects",
      start: "2024",
      end: "Present",
      bullets: [
        {
          id: "b-demo-1",
          text: "Built a SaaS control plane that provisions isolated client sites end-to-end: template selection, Supabase schema/RLS setup, GitHub repo cloning, env injection, and Vercel deploy with custom subdomains.",
          source_fact_ids: ["f-demo-provision"],
        },
        {
          id: "b-demo-2",
          text: "Defined a reusable template contract so new business verticals can be onboarded without rewriting the platform; shipped multiple production client sites from the same pipeline.",
          source_fact_ids: ["f-demo-contract"],
        },
      ],
      projects: [
        {
          id: "p-nova",
          name: "Nova — Market alert desktop + web system",
          tech: ["Python", "FastAPI", "React", "TypeScript", "Electron", "Railway", "Vercel"],
          bullets: [
            {
              id: "b-p-nova",
              text: "Designed a local-first stock alert system with a FastAPI backend, React UI, and Electron desktop packaging plus hosted web deployment (Vercel frontend, Railway backend).",
              source_fact_ids: ["f-nova"],
            },
            {
              id: "b-p-nova-2",
              text: "Integrated read-only market data APIs, caching, and CI/CD deploy paths for a reliable operator workflow.",
              source_fact_ids: ["f-nova-ops"],
            },
          ],
        },
        {
          id: "p-rag",
          name: "Course Q&A (RAG) — Timestamp-cited learning assistant",
          tech: ["Python", "FastAPI", "Pinecone", "Gemini"],
          bullets: [
            {
              id: "b-p-rag",
              text: "Built a RAG service that answers course questions with module/timestamp citations, using chunked transcripts, vector retrieval, and a rate-limited FastAPI API.",
              source_fact_ids: ["f-rag"],
            },
            {
              id: "b-p-rag-2",
              text: "Implemented module-scoped retrieval with corpus fallback and a lightweight embeddable frontend widget.",
              source_fact_ids: ["f-rag-ux"],
            },
          ],
        },
      ],
    },
    {
      id: "role-scan",
      title: "Research & Development Associate",
      company: "Demo Scan",
      start: "2017",
      end: "2018",
      bullets: [
        {
          id: "b-scan-1",
          text: "Designed APIs scanning Bluetooth Low Energy signals for an indoor positioning system; implemented and deployed services using Node.js, Flask, Docker, and Python.",
          source_fact_ids: ["f-scan-ble"],
        },
        {
          id: "b-scan-2",
          text: "Architected and implemented traditional and converged infrastructure; defined the migration strategy from legacy platforms to the target technical architecture.",
          source_fact_ids: ["f-scan-infra"],
        },
        {
          id: "b-scan-3",
          text: "Created functional, regression, and system test suites still in company-wide use.",
          source_fact_ids: ["f-scan-test"],
        },
      ],
      projects: [],
    },
    {
      id: "role-unc",
      title: "Teaching Assistant, Software Engineering",
      company: "Demo University",
      start: "2018",
      end: "2018",
      bullets: [
        {
          id: "b-unc-1",
          text: "Led weekly labs and office hours for software engineering courses; graded projects and exams and contributed to course and curriculum revisions.",
          source_fact_ids: ["f-unc-ta"],
        },
      ],
      projects: [],
    },
    {
      id: "role-ati",
      title: "Manufacturing Engineering Systems Associate",
      company: "Demo Metals",
      start: "Summer 2017",
      end: "Summer 2017",
      bullets: [
        {
          id: "b-ati-1",
          text: "Redesigned a C# application exchanging data with programmable logic controllers; built an API for Siemens, Rockwell, and Modbus TCP PLCs and reworked the SQL database layer.",
          source_fact_ids: ["f-ati-plc"],
        },
      ],
      projects: [],
    },
  ],
  education: [
    {
      id: "edu-unc",
      degree: "Bachelor of Science in Computer Science",
      school: "Demo University",
      details: "Dean's List and Chancellor's List",
    },
  ],
  facts: [
    { id: "f-carrier-cpp", kind: "bullet", text: "C++ HVAC controls + database tooling full lifecycle" },
    { id: "f-carrier-python", kind: "bullet", text: "Python HiL, commissioning automation, and engineering tooling" },
    { id: "f-carrier-arch", kind: "bullet", text: "De facto architect; pipelines and workflows" },
    { id: "f-carrier-reqs", kind: "bullet", text: "Design docs and requirements walkthroughs" },
    { id: "f-carrier-collab", kind: "bullet", text: "Global engineering collaboration" },
    { id: "f-carrier-sustain", kind: "bullet", text: "Sustaining / triage workflows" },
    { id: "f-carrier-loop-pipeline", kind: "project", text: "Closed-loop automation: triage, test generation, PR drafting" },
    { id: "f-carrier-selfheal", kind: "bullet", text: "Self-healing automation layer for build/test/release" },
    { id: "f-carrier-weekend-fix", kind: "bullet", text: "Weekend-built fix for multi-year workflow gap" },
    { id: "f-carrier-self-initiated", kind: "bullet", text: "Self-initiated on personal time; moved to company infrastructure" },
    { id: "f-metric-6h", kind: "metric", text: "Eliminated ~6 hours/week", metric: "6 hours" },
    { id: "f-metric-20eng", kind: "metric", text: "20+ engineers impacted", metric: "20+" },
    { id: "f-metric-60", kind: "metric", text: "60% commissioning time reduction", metric: "60%" },
    { id: "f-carrier-reqs-platform", kind: "project", text: "Requirements management platform" },
    { id: "f-metric-95", kind: "metric", text: "95% test setup time cut", metric: "95%" },
    { id: "f-scan-ble", kind: "bullet", text: "BLE indoor positioning APIs" },
    { id: "f-scan-infra", kind: "bullet", text: "Infrastructure migration" },
    { id: "f-scan-test", kind: "bullet", text: "Company-wide test suites" },
    { id: "f-unc-ta", kind: "bullet", text: "Demo University TA" },
    { id: "f-ati-plc", kind: "bullet", text: "PLC C# / Modbus API" },
    { id: "f-demo-provision", kind: "bullet", text: "Demo Studio end-to-end site provisioning" },
    { id: "f-demo-contract", kind: "bullet", text: "Demo Studio template contract + client sites" },
    { id: "f-nova", kind: "project", text: "Nova FastAPI/React/Electron market alerts" },
    { id: "f-nova-ops", kind: "bullet", text: "Nova market data APIs, caching, CI/CD" },
    { id: "f-rag", kind: "project", text: "PPF-QA RAG with Pinecone + Gemini citations" },
    { id: "f-rag-ux", kind: "bullet", text: "RAG module-scoped retrieval + embeddable widget" },
    { id: "f-skill-plc-tools", kind: "skill", text: "PLC tools: Siemens, Rockwell, Danfoss, Allen-Bradley" },
    { id: "f-skill-git-flask", kind: "skill", text: "Git, Flask, Docker tooling" },
  ],
}

/**
 * Generic baseline aligned to Downloads/jane_demo_resume.pdf
 * (Demo HVAC-focused one-pager — same content shape + PDF shell).
 */
export const DEMO_GENERIC: ResumeDocument = {
  version: 1,
  identity: {
    name: "Jane Demo",
    location: "Demo City, TX",
    phone: "+1 (555) 010-0200",
    email: "jane.demo@example.com",
    links: [],
  },
  summary:
    "Software engineer with 7+ years at Demo HVAC Co turning manual engineering work into closed-loop automation. Self-initiated and built a pipeline running issue triage, test generation, and PR drafting as connected, self-checking stages, gated by human approval with a full audit trail, plus a self-healing layer keeping build and release running unattended. Also known for a weekend-built fix to a multi-year workflow gap, and for architect-level ownership of production systems: a hardware-in-the-loop test environment that cut setup time 95% and a database tool rebuild adopted team-wide.",
  skill_groups: [
    {
      id: "sg-lang",
      label: "Languages",
      items: [
        "C",
        "C++",
        "C#",
        "Python",
        "SQL",
        "JavaScript (Node.js)",
        "protocols (Modbus, BACnet, CAN, CCN)",
      ],
    },
    {
      id: "sg-arch",
      label: "Architecture & Systems",
      items: [
        "closed-loop automation design",
        "agent-orchestrated pipelines",
        "human-in-the-loop workflow design",
        "System architecture design",
        "CI/CD pipelines",
        "API design",
        "embedded controls",
        "hardware-in-the-loop (HiL) testing",
        "database design",
        "cloud migration",
      ],
    },
    {
      id: "sg-tools",
      label: "Tools & Platforms",
      items: [
        "Docker",
        "Git",
        "Flask",
        "Node.js",
        "PLC integration (Siemens, Rockwell, Danfoss, Allen-Bradley)",
      ],
    },
    {
      id: "sg-prac",
      label: "Practices",
      items: [
        "Agile/Scrum",
        "DevOps",
        "requirements engineering",
        "test plan design & execution",
        "HCI/UX design",
        "technical documentation",
      ],
    },
  ],
  roles: [
    {
      id: "role-carrier",
      title: "Software / Systems Engineer",
      company: "Demo HVAC Co",
      start: "2019",
      end: "Present",
      bullets: [
        {
          id: "b-carrier-1",
          text: "Design, develop, test, and release C/C++ software for connected HVAC controls products across multiple platforms, owning features through the full software development lifecycle.",
          source_fact_ids: ["f-carrier-cpp", "f-carrier-python"],
        },
        {
          id: "b-carrier-2",
          text: "Serve as de facto software architect for the team: redesigned system architectures, data pipelines, and build/release workflows now adopted as standard practice across several projects.",
          source_fact_ids: ["f-carrier-arch"],
        },
        {
          id: "b-carrier-3",
          text: "Author software design documents, test plans, procedures, and reports; drive gathering of functional and non-functional requirements and conduct customer walkthroughs to keep programs on schedule.",
          source_fact_ids: ["f-carrier-reqs"],
        },
        {
          id: "b-carrier-4",
          text: "Collaborate with globally distributed engineering teams to align software and controls design across product lines.",
          source_fact_ids: ["f-carrier-collab"],
        },
        {
          id: "b-carrier-5",
          text: "Support sustaining product development for deployed products: streamlined issue reporting and triage workflows, enabling faster resolution of customer-reported issues and improving customer satisfaction.",
          source_fact_ids: ["f-carrier-sustain"],
        },
      ],
      projects: [
        {
          id: "p-loop",
          name: "Closed-Loop Engineering Automation",
          tech: [],
          bullets: [
            {
              id: "b-p-loop-1",
              text: "Designed and built a closed-loop automation pipeline running issue triage, test generation, and PR drafting as connected, self-checking stages — gated by human approval with a full audit trail.",
              source_fact_ids: ["f-carrier-loop-pipeline"],
            },
            {
              id: "b-p-loop-2",
              text: "Built a self-healing layer keeping routine build, test, and release operations running unattended, catching and fixing failures before they reach a person.",
              source_fact_ids: ["f-carrier-selfheal"],
            },
            {
              id: "b-p-loop-3",
              text: "Self-initiated the program on personal time, including a weekend-built fix for a years-old workflow gap, then moved the tooling onto company infrastructure.",
              source_fact_ids: ["f-carrier-weekend-fix", "f-carrier-self-initiated"],
            },
          ],
        },
        {
          id: "p-db",
          name: "Database Tool Modernization",
          tech: [],
          bullets: [
            {
              id: "b-p-db",
              text: "Initiated and architected a ground-up recreation of the team's core database tool, redesigning the data model and processing pipeline; eliminated ~6 hours of manual work per week for 20+ engineers.",
              source_fact_ids: ["f-metric-6h", "f-metric-20eng", "f-carrier-cpp"],
            },
          ],
        },
        {
          id: "p-test",
          name: "Engineering Test & Commissioning Suite",
          tech: [],
          bullets: [
            {
              id: "b-p-test",
              text: "Designed and built a testing suite that automates commissioning workflows and application/fault detection, reducing commissioning and verification time by 60%.",
              source_fact_ids: ["f-metric-60", "f-carrier-python"],
            },
          ],
        },
        {
          id: "p-reqs",
          name: "Requirements Management Platform",
          tech: [],
          bullets: [
            {
              id: "b-p-reqs",
              text: "Initiated and architected requirements management software providing end-to-end traceability from specification through verification, replacing a manual process across multiple teams.",
              source_fact_ids: ["f-carrier-reqs-platform"],
            },
          ],
        },
        {
          id: "p-hil",
          name: "Virtual HiL Environment",
          tech: [],
          bullets: [
            {
              id: "b-p-hil",
              text: "Created a Python-based virtual hardware-in-the-loop system enabling hardware verification without physical test rigs, cutting test setup time by 95%.",
              source_fact_ids: ["f-metric-95", "f-carrier-python"],
            },
          ],
        },
      ],
    },
    {
      id: "role-scan",
      title: "Research & Development Associate",
      company: "Demo Scan",
      start: "2017",
      end: "2018",
      bullets: [
        {
          id: "b-scan-1",
          text: "Designed APIs scanning Bluetooth Low Energy signals for an indoor positioning system; implemented and deployed services using Node.js, Flask, Docker, and Python.",
          source_fact_ids: ["f-scan-ble"],
        },
        {
          id: "b-scan-2",
          text: "Architected and implemented traditional and converged infrastructure; defined the migration strategy from legacy platforms to the target technical architecture.",
          source_fact_ids: ["f-scan-infra"],
        },
        {
          id: "b-scan-3",
          text: "Created functional, regression, and system test suites still in company-wide use.",
          source_fact_ids: ["f-scan-test"],
        },
      ],
      projects: [],
    },
    {
      id: "role-unc",
      title: "Teaching Assistant, Software Engineering",
      company: "Demo University",
      start: "2018",
      end: "2018",
      bullets: [
        {
          id: "b-unc-1",
          text: "Led weekly labs and office hours for software engineering courses; graded projects and exams and contributed to course and curriculum revisions.",
          source_fact_ids: ["f-unc-ta"],
        },
      ],
      projects: [],
    },
    {
      id: "role-ati",
      title: "Manufacturing Engineering Systems Associate",
      company: "Demo Metals",
      start: "Summer 2017",
      end: "Summer 2017",
      bullets: [
        {
          id: "b-ati-1",
          text: "Redesigned a C# application exchanging data with programmable logic controllers; built an API for Siemens, Rockwell, and Modbus TCP PLCs and reworked the SQL database layer.",
          source_fact_ids: ["f-ati-plc"],
        },
      ],
      projects: [],
    },
  ],
  education: structuredClone(DEMO_MASTER.education),
  facts: DEMO_MASTER.facts.filter(
    (f) =>
      !["f-demo-provision", "f-demo-contract", "f-nova", "f-nova-ops", "f-rag", "f-rag-ux"].includes(
        f.id,
      ),
  ),
}
