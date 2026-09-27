import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { CvBuilderData, CvBuilderConfig } from "@/lib/cv-builder";
import { commonStyles } from "./shared";

const styles = StyleSheet.create({
  page: {
    ...commonStyles.page,
    flexDirection: "row",
    padding: 0, // Override padding to use layout
  },
  leftColumn: {
    width: "35%",
    backgroundColor: "#f4f4f4",
    padding: 30,
    paddingRight: 20,
    height: "100%",
  },
  rightColumn: {
    width: "65%",
    padding: 30,
    paddingLeft: 20,
    height: "100%",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
    objectFit: "cover",
    alignSelf: "center",
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  headline: {
    fontSize: 12,
    marginBottom: 20,
  },
  contactItem: {
    fontSize: 10,
    marginBottom: 6,
  },
  sectionTitleLeft: {
    ...commonStyles.sectionTitle,
    fontSize: 14,
    marginTop: 20,
    marginBottom: 10,
    textTransform: "uppercase",
    borderBottom: "1px solid #ddd",
    paddingBottom: 4,
  },
  sectionTitleRight: {
    ...commonStyles.sectionTitle,
    fontSize: 16,
    marginTop: 15,
    marginBottom: 10,
    textTransform: "uppercase",
    borderBottom: "2px solid #eee",
    paddingBottom: 4,
  },
});

export function ProfessionalTemplate({ data, config }: { data: CvBuilderData; config: CvBuilderConfig }) {
  const primaryColor = config.primaryColor || "#0891b2";
  const { personal, summary, experiences, educations, projects, skills, certificates, sectionOrder } = data;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.leftColumn}>
          {personal.avatarUrl ? (
            <Image src={personal.avatarUrl} style={styles.avatar} />
          ) : (
            <View style={{ ...styles.avatar, backgroundColor: "#ddd" }} />
          )}
          
          <Text style={{ ...styles.name, color: primaryColor }}>{personal.fullName || "Tên ứng viên"}</Text>
          <Text style={{ ...styles.headline, color: primaryColor }}>{personal.headline || "Vị trí ứng tuyển"}</Text>
          
          <Text style={{ ...styles.sectionTitleLeft, color: primaryColor }}>Liên hệ</Text>
          {personal.phone ? <Text style={styles.contactItem}>{personal.phone}</Text> : null}
          {personal.email ? <Text style={styles.contactItem}>{personal.email}</Text> : null}
          {personal.city ? <Text style={styles.contactItem}>{personal.city}</Text> : null}

          {skills.length > 0 && (
            <View>
              <Text style={{ ...styles.sectionTitleLeft, color: primaryColor }}>Kỹ năng</Text>
              {skills.map(s => (
                <Text key={s.id} style={styles.contactItem}>• {s.name}</Text>
              ))}
            </View>
          )}

          {certificates.length > 0 && (
            <View>
              <Text style={{ ...styles.sectionTitleLeft, color: primaryColor }}>Chứng chỉ</Text>
              {certificates.map(c => (
                <View key={c.id} style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: "bold" }}>{c.name}</Text>
                  <Text style={{ fontSize: 9 }}>{c.issuer}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.rightColumn}>
          {sectionOrder.map((section, index) => {
            if (section === "personal" || section === "skills" || section === "certificates") return null;

            if (section === "summary" && summary) {
              return (
                <View key={`${section}-${index}`}>
                  <Text style={{ ...styles.sectionTitleRight, color: primaryColor }}>Tóm tắt</Text>
                  <Text style={commonStyles.text}>{summary}</Text>
                </View>
              );
            }

            if (section === "experiences" && experiences.length > 0) {
              return (
                <View key={`${section}-${index}`}>
                  <Text style={{ ...styles.sectionTitleRight, color: primaryColor }}>Kinh nghiệm làm việc</Text>
                  {experiences.map((exp) => (
                    <View key={exp.id} style={{ marginBottom: 10 }}>
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
                  <Text style={{ ...styles.sectionTitleRight, color: primaryColor }}>Học vấn</Text>
                  {educations.map((edu) => (
                    <View key={edu.id} style={{ marginBottom: 10 }}>
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
                  <Text style={{ ...styles.sectionTitleRight, color: primaryColor }}>Dự án</Text>
                  {projects.map((proj) => (
                    <View key={proj.id} style={{ marginBottom: 10 }}>
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

            return null;
          })}
        </View>
      </Page>
    </Document>
  );
}
