import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { CvBuilderData, CvBuilderConfig } from "@/lib/cv-builder";
import { commonStyles } from "./shared";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    flexDirection: "row",
    backgroundColor: "#ffffff",
  },
  leftColumn: {
    width: "35%",
    padding: 24,
    color: "#ffffff",
  },
  rightColumn: {
    width: "65%",
    padding: 24,
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  headline: {
    fontSize: 14,
    marginBottom: 20,
    opacity: 0.9,
  },
  sectionTitleLeft: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    marginTop: 16,
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(255,255,255,0.3)",
    paddingBottom: 4,
  },
  textLeft: {
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 4,
    opacity: 0.9,
  },
  skillBadge: {
    padding: "4px 8px",
    borderRadius: 4,
    marginBottom: 4,
    marginRight: 4,
    fontSize: 9,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  skillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
  },
  sectionTitleRight: {
    ...commonStyles.sectionTitle,
  },
});

export function ModernTemplate({ data, config }: { data: CvBuilderData; config: CvBuilderConfig }) {
  const primaryColor = config.primaryColor || "#059669";
  const { personal, summary, experiences, educations, projects, skills, certificates, sectionOrder } = data;

  const leftColumnSections = sectionOrder.filter((s) => ["personal", "skills", "certificates"].includes(s));
  const rightColumnSections = sectionOrder.filter((s) => ["summary", "experiences", "educations", "projects"].includes(s));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={{ ...styles.leftColumn, backgroundColor: primaryColor }}>
          {leftColumnSections.map((section, index) => {
            if (section === "personal") {
              return (
                <View key={`${section}-${index}`}>
                  <Text style={styles.name}>{personal.fullName || "Tên ứng viên"}</Text>
                  <Text style={styles.headline}>{personal.headline || "Vị trí ứng tuyển"}</Text>
                  
                  <View style={{ marginTop: 20 }}>
                    <Text style={styles.sectionTitleLeft}>Liên hệ</Text>
                    {personal.phone ? <Text style={styles.textLeft}>{personal.phone}</Text> : null}
                    {personal.email ? <Text style={styles.textLeft}>{personal.email}</Text> : null}
                    {personal.city ? <Text style={styles.textLeft}>{personal.city}</Text> : null}
                  </View>
                </View>
              );
            }
            
            if (section === "skills" && skills.length > 0) {
              return (
                <View key={`${section}-${index}`}>
                  <Text style={styles.sectionTitleLeft}>Kỹ năng</Text>
                  <View style={styles.skillsContainer}>
                    {skills.map((sk) => (
                      <Text key={sk.id} style={styles.skillBadge}>{sk.name}</Text>
                    ))}
                  </View>
                </View>
              );
            }

            if (section === "certificates" && certificates.length > 0) {
              return (
                <View key={`${section}-${index}`}>
                  <Text style={styles.sectionTitleLeft}>Chứng chỉ</Text>
                  {certificates.map((cert) => (
                    <View key={cert.id} style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: "bold" }}>{cert.name}</Text>
                      <Text style={{ fontSize: 9, opacity: 0.8 }}>{cert.issuer} {cert.date ? `(${cert.date.slice(0,10)})` : ""}</Text>
                    </View>
                  ))}
                </View>
              );
            }
            return null;
          })}
        </View>

        <View style={styles.rightColumn}>
          {rightColumnSections.map((section, index) => {
            if (section === "summary" && summary) {
              return (
                <View key={`${section}-${index}`}>
                  <Text style={{ ...styles.sectionTitleRight, color: primaryColor, borderBottomColor: primaryColor }}>Giới thiệu</Text>
                  <Text style={commonStyles.text}>{summary}</Text>
                </View>
              );
            }

            if (section === "experiences" && experiences.length > 0) {
              return (
                <View key={`${section}-${index}`}>
                  <Text style={{ ...styles.sectionTitleRight, color: primaryColor, borderBottomColor: primaryColor }}>Kinh nghiệm làm việc</Text>
                  {experiences.map((exp) => (
                    <View key={exp.id} style={{ marginBottom: 10 }}>
                      <Text style={commonStyles.itemTitle}>{exp.position} - {exp.company}</Text>
                      <Text style={commonStyles.itemSubtitle}>
                        {exp.startDate?.slice(0, 10) || "?"} đến {exp.isCurrent ? "Hiện tại" : exp.endDate?.slice(0, 10) || "?"}
                      </Text>
                      <Text style={commonStyles.itemDescription}>{exp.description}</Text>
                    </View>
                  ))}
                </View>
              );
            }

            if (section === "educations" && educations.length > 0) {
              return (
                <View key={`${section}-${index}`}>
                  <Text style={{ ...styles.sectionTitleRight, color: primaryColor, borderBottomColor: primaryColor }}>Học vấn</Text>
                  {educations.map((edu) => (
                    <View key={edu.id} style={{ marginBottom: 10 }}>
                      <Text style={commonStyles.itemTitle}>{edu.school}</Text>
                      <Text style={commonStyles.itemSubtitle}>
                        {edu.major} {edu.degree ? `(${edu.degree})` : ""}
                      </Text>
                      <Text style={commonStyles.itemSubtitle}>
                        {edu.startYear} - {edu.isCurrent ? "Hiện tại" : edu.endYear}
                      </Text>
                      <Text style={commonStyles.itemDescription}>{edu.description}</Text>
                    </View>
                  ))}
                </View>
              );
            }

            if (section === "projects" && projects.length > 0) {
              return (
                <View key={`${section}-${index}`}>
                  <Text style={{ ...styles.sectionTitleRight, color: primaryColor, borderBottomColor: primaryColor }}>Dự án nổi bật</Text>
                  {projects.map((proj) => (
                    <View key={proj.id} style={{ marginBottom: 10 }}>
                      <Text style={commonStyles.itemTitle}>{proj.name}</Text>
                      <Text style={commonStyles.itemSubtitle}>
                        {proj.startDate?.slice(0, 10) || "?"} - {proj.isWorkingOn ? "Đang thực hiện" : proj.endDate?.slice(0, 10) || "?"}
                      </Text>
                      <Text style={commonStyles.itemDescription}>{proj.description}</Text>
                    </View>
                  ))}
                </View>
              );
            }

            return null;
          })}
        </View>
      </Page>
    </Document>
  );
}
