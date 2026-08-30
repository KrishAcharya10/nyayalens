"""Render a BuiltDocument's plain text into .docx and .pdf files."""
from docx import Document as DocxDocument
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def render_docx(text: str, out_path: str):
    doc = DocxDocument()
    for line in text.split("\n"):
        doc.add_paragraph(line)
    doc.save(out_path)


def render_pdf(text: str, out_path: str):
    styles = getSampleStyleSheet()
    body_style = styles["Normal"]
    doc = SimpleDocTemplate(
        out_path, pagesize=A4,
        leftMargin=1 * inch, rightMargin=1 * inch,
        topMargin=1 * inch, bottomMargin=1 * inch,
    )
    story = []
    for line in text.split("\n"):
        if line.strip() == "":
            story.append(Spacer(1, 10))
        else:
            # Escape characters that reportlab's mini-HTML parser would choke on
            safe_line = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(safe_line, body_style))
    doc.build(story)
