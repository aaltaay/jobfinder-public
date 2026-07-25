// Generic demo fixture for public portfolio extract.
export const DEMO_MASTER = {
  version: 1,
  identity: {
    name: "Jane Demo",
    location: "Austin, TX",
    phone: "+1 (555) 010-0200",
    email: "jane.demo@example.com",
    links: [{ label: "GitHub", url: "https://github.com/jane-demo" }],
  },
  summary:
    "Senior software engineer with 7+ years building full-stack products, internal platforms, and developer tooling.",
  skill_groups: [
    {
      id: "sg-lang",
      label: "Languages",
      items: ["Python", "TypeScript", "SQL"],
    },
    {
      id: "sg-stack",
      label: "Stack",
      items: ["React", "FastAPI", "Postgres", "Supabase", "Docker"],
    },
  ],
  experience: [
    {
      id: "exp-acme",
      company: "Acme Corp",
      title: "Senior Software Engineer",
      location: "Remote",
      start: "2019-01",
      end: null,
      highlights: [
        "Shipped customer-facing APIs and admin tooling.",
        "Led CI/CD and observability standards adoption.",
      ],
    },
  ],
  projects: [],
  education: [],
}

export const DEMO_GENERIC = {
  ...DEMO_MASTER,
  summary: "Full-stack engineer focused on product delivery and platform tooling.",
}
