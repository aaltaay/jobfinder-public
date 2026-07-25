import type { ResumeDocument } from "./schema"
import { sanitizeResumeHtml } from "@/lib/sanitizeHtml"

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function renderResumeHtml(doc: ResumeDocument): string {
  const contactParts = [
    doc.identity.location,
    doc.identity.phone,
    doc.identity.email,
    ...doc.identity.links.map((l) => l.url),
  ].filter(Boolean)

  const skills = doc.skill_groups
    .map(
      (g) =>
        `<li class="resume-skill"><strong>${esc(g.label)}:</strong> ${esc(g.items.join(", "))}</li>`,
    )
    .join("\n")

  const roles = doc.roles
    .map((role) => {
      const bullets = role.bullets
        .map((b) => `<li>${esc(b.text)}</li>`)
        .join("\n")
      const projects =
        role.projects.length === 0
          ? ""
          : `<h4>Selected Projects</h4>
      <ul>
        ${role.projects
          .map((p) => {
            const tech = p.tech.length ? ` (${esc(p.tech.join(", "))})` : ""
            const pBullets = p.bullets.map((b) => esc(b.text)).join(" ")
            return `<li><strong>${esc(p.name)}:</strong> ${pBullets}${tech}</li>`
          })
          .join("\n")}
      </ul>`
      return `<div class="resume-role">
      <h3>${esc(role.title)} — ${esc(role.company)}</h3>
      <p class="resume-dates">${esc(role.start)} – ${esc(role.end)}</p>
      <ul>${bullets}</ul>
      ${projects}
    </div>`
    })
    .join("\n")

  const education = doc.education
    .map((e) => {
      const details = e.details ? ` · ${esc(e.details)}` : ""
      return `<p><strong>${esc(e.degree)}</strong> — ${esc(e.school)}${details}</p>`
    })
    .join("\n")

  const raw = `<article class="resume">
  <header class="resume-header">
    <h1>${esc(doc.identity.name)}</h1>
    <p class="resume-contact">${esc(contactParts.join(" · "))}</p>
  </header>
  <section>
    <h2>Summary</h2>
    <p>${esc(doc.summary)}</p>
  </section>
  <section>
    <h2>Skills</h2>
    <ul class="resume-skills">${skills}</ul>
  </section>
  <section>
    <h2>Professional Experience</h2>
    ${roles}
  </section>
  <section>
    <h2>Education</h2>
    ${education}
  </section>
</article>`

  return sanitizeResumeHtml(raw)
}
