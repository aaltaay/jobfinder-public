import { useMemo } from "react"
import { prepareDescription } from "@/lib/description"

export default function JobDescription({ text }: { text: string }) {
  const { paragraphs } = useMemo(() => prepareDescription(text), [text])

  if (!paragraphs.length) {
    return (
      <div className="job-description-panel">
        <div className="job-description-label">Description</div>
        <div className="job-description job-description-empty">No description provided.</div>
      </div>
    )
  }

  return (
    <div className="job-description-panel">
      <div className="job-description-label">Description</div>
      <div className="job-description">
        {paragraphs.map((p, i) => {
          const isHeading = p.length < 64 && !/[.!?]$/.test(p)
          return (
            <p key={i} className={isHeading ? "job-description-p job-description-h" : "job-description-p"}>
              {p}
            </p>
          )
        })}
      </div>
    </div>
  )
}
