import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { CvBuilderData, CvBuilderConfig } from "@/lib/cv-builder";
import { commonStyles } from "./shared";

const styles = StyleSheet.create({
  page: {
    ...commonStyles.page,
    flexDirection: "column",
  },
  header: {
    alignItems: "center",
    marginBottom: 20,
    borderBottom: "2px solid #1a1a1a",
    paddingBottom: 16,
  },
  name: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  headline: {
    fontSize: 14,
    color: "#444",
    marginBottom: 8,
  },
  contact: {
    flexDirection: "row",
    fontSize: 10,
    color: "#666",
    gap: 10,
  },
  sectionTitle: {
    ...commonStyles.sectionTitle,
    borderBottom: "1px solid #ccc",
    paddingBottom: 2,
    marginTop: 16,
    textTransform: "uppercase",
  },
});

export function ClassicTemplate({ data, config }: { data: CvBuilderData; config: CvBuilderConfig }) {
  const primaryColor = config.primaryColor || "#1a1a1a";
  const { personal, summary, experiences, educations, projects, skills, certificates, sectionOrder } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={{ ...styles.header, borderBottomColor: primaryColor }}>
          <Text style={{ ...styles.name, color: primaryColor }}>{personal.fullName || "Tên ứng viên"}</Text>
          <Text style={styles.headline}>{personal.headline || "Vị trí ứng tuyển"}</Text>
          <View style={styles.contact}>
            {personal.phone ? <Text>{personal.phone}</Text> : null}
            {personal.email ? <Text>• {personal.email}</Text> : null}
            {personal.city ? <Text>• {personal.city}</Text> : null}
          </View>
        </View>

        {sectionOrder.map((section, index) => {
          if (section === "personal") return null; // already rendered in header

          if (section === "summary" && summary) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={{ ...styles.sectionTitle, color: primaryColor }}>Tóm tắt</Text>
                <Text style={commonStyles.text}>{summary}</Text>
              </View>
            );
          }

          if (section === "experiences" && experiences.length > 0) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={{ ...styles.sectionTitle, color: primaryColor }}>Kinh nghiệm làm việc</Text>
                {experiences.map((exp) => (
                  <View key={exp.id} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                      <Text style={commonStyles.itemTitle}>{exp.position}</Text>
                      <Text style={commonStyles.itemSubtitle}>
                        {exp.startDate?.slice(0, 10)} - {exp.isCurrent ? "Hiện tại" : exp.endDate?.slice(0, 10)}
                      </Text>
                    </View>
                    <Text style={{ ...commonStyles.itemTitle, fontSize: 10, color: "#444" }}>{exp.company}</Text>
                    <Text style={{ ...commonStyles.itemDescription, marginTop: 4 }}>{exp.description}</Text>
                  </View>
                ))}
              </View>
            );
          }

          if (section === "educations" && educations.length > 0) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={{ ...styles.sectionTitle, color: primaryColor }}>Học vấn</Text>
                {educations.map((edu) => (
                  <View key={edu.id} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                      <Text style={commonStyles.itemTitle}>{edu.school}</Text>
                      <Text style={commonStyles.itemSubtitle}>
                        {edu.startYear} - {edu.isCurrent ? "Hiện tại" : edu.endYear}
                      </Text>
                    </View>
                    <Text style={commonStyles.itemSubtitle}>{edu.major} {edu.degree ? `(${edu.degree})` : ""}</Text>
                    <Text style={{ ...commonStyles.itemDescription, marginTop: 2 }}>{edu.description}</Text>
                  </View>
                ))}
              </View>
            );
          }

          if (section === "projects" && projects.length > 0) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={{ ...styles.sectionTitle, color: primaryColor }}>Dự án</Text>
                {projects.map((proj) => (
                  <View key={proj.id} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 2 }}>
                      <Text style={commonStyles.itemTitle}>{proj.name}</Text>
                      <Text style={commonStyles.itemSubtitle}>
                        {proj.startDate?.slice(0, 10)} - {proj.isWorkingOn ? "Hiện tại" : proj.endDate?.slice(0, 10)}
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
                <Text style={{ ...styles.sectionTitle, color: primaryColor }}>Kỹ năng</Text>
                <Text style={commonStyles.text}>
                  {skills.map(s => s.name).join(" • ")}
                </Text>
              </View>
            );
          }

          if (section === "certificates" && certificates.length > 0) {
            return (
              <View key={`${section}-${index}`}>
                <Text style={{ ...styles.sectionTitle, color: primaryColor }}>Chứng chỉ</Text>
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
