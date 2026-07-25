/**
 * OP-0 helper: page count under the *shipped/HEAD* PDF packing
 * (pad 40/48, font 10.5, role wrap=false) — what production still serves
 * until densify packing is deployed. Used only to lock the live overflow
 * bug; product export uses densify + assertOnePageResumePdf (OP-B compose).
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer"
import type { ResumeDocument } from "@/lib/resume/schema"

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 48,
    fontFamily: "Times-Roman",
    fontSize: 10.5,
    lineHeight: 1.4,
    color: "#1a1a1a",
  },
  name: { fontSize: 18, fontFamily: "Times-Bold", marginBottom: 4 },
  contact: { fontSize: 9.5, color: "#555", marginBottom: 14 },
  h2: {
    fontSize: 10,
    fontFamily: "Times-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#555",
    marginTop: 12,
    marginBottom: 4,
  },
  h3: { fontSize: 11, fontFamily: "Times-Bold", marginTop: 8 },
  dates: { fontSize: 9, color: "#555", marginBottom: 3 },
  p: { marginBottom: 4 },
  bullet: { marginLeft: 12, marginBottom: 2 },
  projectTitle: { fontSize: 10, fontFamily: "Times-Bold", marginTop: 6 },
})

function ShippedBaselinePdfDoc({ doc }: { doc: ResumeDocument }) {
  const contact = [doc.identity.location, doc.identity.phone, doc.identity.email]
    .filter(Boolean)
    .join(" · ")

  return (
    <Document title={doc.identity.name}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{doc.identity.name}</Text>
        <Text style={styles.contact}>{contact}</Text>

        <Text style={styles.h2}>Summary</Text>
        <Text style={styles.p}>{doc.summary}</Text>

        <Text style={styles.h2}>Skills</Text>
        {doc.skill_groups.map((g) => (
          <Text key={g.id} style={styles.p}>
            {g.label}: {g.items.join(", ")}
          </Text>
        ))}

        <Text style={styles.h2}>Professional Experience</Text>
        {doc.roles.map((role) => (
          <View key={role.id} wrap={false}>
            <Text style={styles.h3}>
              {role.title} — {role.company}
            </Text>
            <Text style={styles.dates}>
              {role.start} – {role.end}
            </Text>
            {role.bullets.map((b) => (
              <Text key={b.id} style={styles.bullet}>
                • {b.text}
              </Text>
            ))}
            {role.projects.length > 0 ? (
              <Text style={styles.projectTitle}>Selected Projects</Text>
            ) : null}
            {role.projects.map((p) => (
              <View key={p.id}>
                {p.bullets.map((b) => (
                  <Text key={b.id} style={styles.bullet}>
                    • {p.name}: {b.text}
                    {p.tech.length ? ` (${p.tech.join(", ")})` : ""}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.h2}>Education</Text>
        {doc.education.map((e) => (
          <Text key={e.id} style={styles.p}>
            {e.degree} — {e.school}
            {e.details ? ` · ${e.details}` : ""}
          </Text>
        ))}
      </Page>
    </Document>
  )
}

/** LETTER page count with committed/shipped packing (pre-densify). */
export async function countShippedBaselineResumePdfPages(
  doc: ResumeDocument,
): Promise<number> {
  const { countPdfPagesFromBytes } = await import(
    "@/lib/resume/pdfPageCount"
  )
  const blob = await pdf(<ShippedBaselinePdfDoc doc={doc} />).toBlob()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return countPdfPagesFromBytes(bytes)
}
