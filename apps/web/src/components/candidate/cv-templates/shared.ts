import { Font, StyleSheet } from "@react-pdf/renderer";

Font.register({
  family: 'Roboto',
  fonts: [
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf', fontWeight: 300 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf', fontWeight: 400 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Italic.ttf', fontWeight: 400, fontStyle: 'italic' },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Medium.ttf', fontWeight: 500 },
    { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Medium.ttf', fontWeight: 700 },
  ],
});

export const commonStyles = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    backgroundColor: "#ffffff",
    padding: 30,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
    marginTop: 20,
    borderBottom: "1px solid #eeeeee",
    paddingBottom: 4,
  },
  text: {
    fontSize: 10,
    color: "#444444",
    lineHeight: 1.5,
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: 10,
    color: "#666666",
    marginBottom: 4,
    fontStyle: "italic",
  },
  itemDescription: {
    fontSize: 10,
    color: "#444444",
    lineHeight: 1.5,
    marginBottom: 10,
  },
});
