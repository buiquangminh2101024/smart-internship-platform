import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { CvBuilderData, CvBuilderConfig } from "@/lib/cv-builder";
import { commonStyles } from "./shared";

const styles = StyleSheet.create({
  page: {
    ...commonStyles.page,
    flexDirection: "column",
    paddingLeft: 40,
    paddingRight: 40,
  },
  header: {
    marginBottom: 24,
  },
  name: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 6,
    color: "#000",
  },
  contactText: {
    fontSize: 9,
    color: "#333",
    lineHeight: 1.4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#000",
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase",
  },
  divider: {
    borderBottom: "1px solid #000",
    marginBottom: 8,
  },
});

export function MinimalTemplate({ data, config }: { data: CvBuilderData; config: CvBuilderConfig }) {
  const { personal, summary, experiences, educations, projects, skills, certificates, sectionOrder } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{personal.fullName || "Tên ứng viên"}</Text>
          <Text style={styles.contactText}>
            {[
              personal.phone,
              personal.email,
              personal.city
            ].filter(Boolean).join(" | ")}
          </Text>
        </View>

        {sectionOrder.map((section, index) => {
          if (section === "personal") return null;

          if (section === "summary" && summary) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={styles.sectionTitle}>Summary</Text>
                <View style={styles.divider} />
                <Text style={commonStyles.text}>{summary}</Text>
              </View>
            );
          }

          if (section === "experiences" && experiences.length > 0) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={styles.sectionTitle}>Experience</Text>
                <View style={styles.divider} />
                {experiences.map((exp) => (
                  <View key={exp.id} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={commonStyles.itemTitle}>{exp.position}</Text>
                      <Text style={{ fontSize: 9 }}>
                        {exp.startDate?.slice(0, 10)} - {exp.isCurrent ? "Present" : exp.endDate?.slice(0, 10)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 10, fontStyle: "italic", marginBottom: 4 }}>{exp.company}</Text>
                    <Text style={commonStyles.itemDescription}>{exp.description}</Text>
                  </View>
                ))}
              </View>
            );
          }

          if (section === "educations" && educations.length > 0) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={styles.sectionTitle}>Education</Text>
                <View style={styles.divider} />
                {educations.map((edu) => (
                  <View key={edu.id} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={commonStyles.itemTitle}>{edu.school}</Text>
                      <Text style={{ fontSize: 9 }}>
                        {edu.startYear} - {edu.isCurrent ? "Present" : edu.endYear}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 10 }}>{edu.degree ? `${edu.degree} in ` : ""}{edu.major}</Text>
                  </View>
                ))}
              </View>
            );
          }

          if (section === "projects" && projects.length > 0) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={styles.sectionTitle}>Projects</Text>
                <View style={styles.divider} />
                {projects.map((proj) => (
                  <View key={proj.id} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={commonStyles.itemTitle}>{proj.name}</Text>
                      <Text style={{ fontSize: 9 }}>
                        {proj.startDate?.slice(0, 10)} - {proj.isWorkingOn ? "Present" : proj.endDate?.slice(0, 10)}
                      </Text>
                    </View>
                    <Text style={{ ...commonStyles.itemDescription, marginTop: 4 }}>{proj.description}</Text>
                  </View>
                ))}
              </View>
            );
          }

          if (section === "skills" && skills.length > 0) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={styles.sectionTitle}>Skills</Text>
                <View style={styles.divider} />
                <Text style={commonStyles.text}>
                  {skills.map(s => s.name).join(", ")}
                </Text>
              </View>
            );
          }

          if (section === "certificates" && certificates.length > 0) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={styles.sectionTitle}>Certificates</Text>
                <View style={styles.divider} />
                {certificates.map((cert) => (
                  <View key={cert.id} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={commonStyles.itemTitle}>{cert.name}</Text>
                    <Text style={commonStyles.itemSubtitle}>{cert.issuer} {cert.date ? `(${cert.date.slice(0, 10)})` : ""}</Text>
                  </View>
                ))}
              </View>
            );
          }

          return null;
        })}
      </Page>
    </Document>
  );
}
