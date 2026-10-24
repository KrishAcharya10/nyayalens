# scripts/build_full_documents.py
# -*- coding: utf-8 -*-
"""
Builds the complete IEEE formatted paper across docx, html, and markdown:
  1. docs/paper/NyayaLens_IEEE_paper.docx (2-column IEEE, side-by-side authors, 6 figures, 10 tables, 3 algorithms)
  2. docs/paper/paper.html (IEEE two-column style HTML preview)
  3. docs/research_paper.md (Full GitHub markdown source)
"""

import os
import sys
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

import scripts.paper_data as pd

def set_cell_border(cell, **kwargs):
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = tcPr.first_child_found_in("w:tcBorders")
    if tcBorders is None:
        tcBorders = OxmlElement('w:tcBorders')
        tcPr.append(tcBorders)
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        edge_data = kwargs.get(edge)
        if edge_data:
            tag = 'w:{}'.format(edge)
            element = tcBorders.find(qn(tag))
            if element is None:
                element = OxmlElement(tag)
                tcBorders.append(element)
            for key in ["val", "color", "sz", "space"]:
                if key in edge_data:
                    element.set(qn('w:{}'.format(key)), str(edge_data[key]))

def set_cell_margins(cell, top=45, bottom=45, left=70, right=70):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def build_docx(output_path):
    print(f"Building DOCX: {output_path}...")
    doc = docx.Document()

    # Section 0: Title, Authors, Abstract, Index Terms (Single column)
    s0 = doc.sections[0]
    s0.top_margin = Inches(0.75)
    s0.bottom_margin = Inches(0.9)
    s0.left_margin = Inches(0.75)
    s0.right_margin = Inches(0.75)
    s0.page_width = Inches(8.5)
    s0.page_height = Inches(11.0)

    # Document Title
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(12)
    run_title = p_title.add_run(pd.TITLE)
    run_title.font.name = 'Times New Roman'
    run_title.font.size = Pt(20)
    run_title.font.bold = True

    # Authors Table (Side by side in 2 equal columns, borderless)
    table_auth = doc.add_table(rows=1, cols=2)
    table_auth.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_auth.autofit = False

    for idx, auth in enumerate(pd.AUTHORS):
        cell = table_auth.cell(0, idx)
        cell.width = Inches(3.4)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.line_spacing = 1.1

        # Author Name
        r_name = p.add_run(auth["name"] + "\n")
        r_name.font.name = 'Times New Roman'
        r_name.font.size = Pt(11)
        r_name.font.bold = True

        # Dept
        r_dept = p.add_run(auth["dept"] + "\n")
        r_dept.font.name = 'Times New Roman'
        r_dept.font.size = Pt(9.5)

        # School
        r_school = p.add_run(auth["school"] + "\n")
        r_school.font.name = 'Times New Roman'
        r_school.font.size = Pt(9.5)

        # Univ & Location
        r_univ = p.add_run(auth["univ"] + "\n")
        r_univ.font.name = 'Times New Roman'
        r_univ.font.size = Pt(9.5)

        # Email
        r_email = p.add_run(auth["email"])
        r_email.font.name = 'Times New Roman'
        r_email.font.size = Pt(9.5)
        r_email.font.italic = True

    # Abstract Paragraph
    p_abs = doc.add_paragraph()
    p_abs.paragraph_format.space_before = Pt(14)
    p_abs.paragraph_format.space_after = Pt(3)
    p_abs.paragraph_format.line_spacing = 1.15
    p_abs.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    
    r_abs_lead = p_abs.add_run("Abstract—")
    r_abs_lead.font.name = 'Times New Roman'
    r_abs_lead.font.size = Pt(9.5)
    r_abs_lead.font.bold = True
    r_abs_lead.font.italic = True

    r_abs_text = p_abs.add_run(pd.ABSTRACT)
    r_abs_text.font.name = 'Times New Roman'
    r_abs_text.font.size = Pt(9)
    r_abs_text.font.bold = True

    # Index Terms Paragraph
    p_idx = doc.add_paragraph()
    p_idx.paragraph_format.space_before = Pt(3)
    p_idx.paragraph_format.space_after = Pt(12)
    p_idx.paragraph_format.line_spacing = 1.15
    p_idx.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    r_idx_lead = p_idx.add_run("Index Terms—")
    r_idx_lead.font.name = 'Times New Roman'
    r_idx_lead.font.size = Pt(9.5)
    r_idx_lead.font.bold = True
    r_idx_lead.font.italic = True

    r_idx_text = p_idx.add_run(pd.INDEX_TERMS)
    r_idx_text.font.name = 'Times New Roman'
    r_idx_text.font.size = Pt(9)
    r_idx_text.font.italic = True

    # Add Section 1: Two-column layout
    s1 = doc.add_section()
    s1.top_margin = Inches(0.75)
    s1.bottom_margin = Inches(0.9)
    s1.left_margin = Inches(0.75)
    s1.right_margin = Inches(0.75)
    s1.page_width = Inches(8.5)
    s1.page_height = Inches(11.0)

    # Set 2 columns with 0.25 in gutter
    sectPr = s1._sectPr
    cols = OxmlElement('w:cols')
    cols.set(qn('w:num'), '2')
    cols.set(qn('w:space'), '360')
    sectPr.append(cols)

    # Helper function definitions for section 1
    def add_h1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(11)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.keep_with_next = True
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(text)
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10)
        r.font.bold = True

    def add_h2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(7)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.keep_with_next = True
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.add_run(text)
        r.font.name = 'Times New Roman'
        r.font.size = Pt(9.5)
        r.font.bold = True
        r.font.italic = True

    def add_p(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.line_spacing = 1.15
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.paragraph_format.first_line_indent = Inches(0.18)
        r = p.add_run(text)
        r.font.name = 'Times New Roman'
        r.font.size = Pt(9.5)

    def add_fig(img_path, cap):
        if not os.path.exists(img_path):
            return
        p_img = doc.add_paragraph()
        p_img.paragraph_format.space_before = Pt(5)
        p_img.paragraph_format.space_after = Pt(2)
        p_img.paragraph_format.keep_with_next = True
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p_img.add_run()
        r.add_picture(img_path, width=Inches(3.35))

        p_c = doc.add_paragraph()
        p_c.paragraph_format.space_before = Pt(2)
        p_c.paragraph_format.space_after = Pt(6)
        p_c.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        rc = p_c.add_run(cap)
        rc.font.name = 'Times New Roman'
        rc.font.size = Pt(8)
        rc.font.italic = True

    def add_tbl(tbl_meta):
        # Table Caption
        p_cap = doc.add_paragraph()
        p_cap.paragraph_format.space_before = Pt(7)
        p_cap.paragraph_format.space_after = Pt(2)
        p_cap.paragraph_format.keep_with_next = True
        p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r1 = p_cap.add_run(f"TABLE {tbl_meta['num']}\n")
        r1.font.name = 'Times New Roman'
        r1.font.size = Pt(8)
        r1.font.bold = True
        r2 = p_cap.add_run(tbl_meta['title'].upper())
        r2.font.name = 'Times New Roman'
        r2.font.size = Pt(7.5)
        r2.font.bold = True

        # Add Table
        t = doc.add_table(rows=len(tbl_meta['data']) + 1, cols=len(tbl_meta['headers']))
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = False

        # Header Row
        hdr_cells = t.rows[0].cells
        for c_idx, h in enumerate(tbl_meta['headers']):
            hdr_cells[c_idx].text = h
            if tbl_meta.get('widths') and c_idx < len(tbl_meta['widths']):
                hdr_cells[c_idx].width = tbl_meta['widths'][c_idx]
            set_cell_border(hdr_cells[c_idx], top={"val": "single", "sz": "10", "color": "000000"},
                                              bottom={"val": "single", "sz": "8", "color": "000000"})
            set_cell_margins(hdr_cells[c_idx], top=60, bottom=60, left=50, right=50)
            p = hdr_cells[c_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            for r in p.runs:
                r.font.name = 'Times New Roman'
                r.font.size = Pt(7.5)
                r.font.bold = True

        # Data Rows
        for r_idx, r_data in enumerate(tbl_meta['data']):
            row_cells = t.rows[r_idx + 1].cells
            is_last = (r_idx == len(tbl_meta['data']) - 1)
            for c_idx, val in enumerate(r_data):
                row_cells[c_idx].text = str(val)
                if tbl_meta.get('widths') and c_idx < len(tbl_meta['widths']):
                    row_cells[c_idx].width = tbl_meta['widths'][c_idx]
                
                b_kwargs = {}
                if is_last:
                    b_kwargs["bottom"] = {"val": "single", "sz": "10", "color": "000000"}
                else:
                    b_kwargs["bottom"] = {"val": "single", "sz": "4", "color": "D8D8D8"}
                set_cell_border(row_cells[c_idx], **b_kwargs)
                set_cell_margins(row_cells[c_idx], top=35, bottom=35, left=50, right=50)

                p = row_cells[c_idx].paragraphs[0]
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT if c_idx == 0 else WD_ALIGN_PARAGRAPH.CENTER
                p.paragraph_format.space_before = Pt(1)
                p.paragraph_format.space_after = Pt(1)
                for r in p.runs:
                    r.font.name = 'Times New Roman'
                    r.font.size = Pt(7)
                    if is_last and ('Total' in str(r_data[0]) or 'Overall' in str(r_data[0]) or 'Micro-Average' in str(r_data[0])):
                        r.font.bold = True
        
        doc.add_paragraph().paragraph_format.space_after = Pt(3)

    def add_algo(algo_meta):
        p_t = doc.add_paragraph()
        p_t.paragraph_format.space_before = Pt(6)
        p_t.paragraph_format.space_after = Pt(2)
        p_t.paragraph_format.keep_with_next = True
        rt = p_t.add_run(algo_meta['title'])
        rt.font.name = 'Times New Roman'
        rt.font.size = Pt(8.5)
        rt.font.bold = True

        table = doc.add_table(rows=1, cols=1)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        cell = table.cell(0, 0)
        cell.width = Inches(3.35)
        set_cell_border(cell, top={"val": "single", "sz": "8", "color": "000000"},
                              bottom={"val": "single", "sz": "8", "color": "000000"})
        set_cell_margins(cell, top=45, bottom=45, left=60, right=60)
        
        cell.text = ""
        for idx, l in enumerate(algo_meta['lines']):
            p = cell.add_paragraph() if idx > 0 else cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(1)
            p.paragraph_format.line_spacing = 1.05
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            r = p.add_run(l)
            r.font.name = 'Courier New' if l.startswith('  ') else 'Times New Roman'
            r.font.size = Pt(7.2)
            if 'Input:' in l or 'Output:' in l:
                r.font.bold = True

        doc.add_paragraph().paragraph_format.space_after = Pt(3)

    # Render Sections with embedded figures, tables, and algorithms
    table_map = {t["num"]: t for t in pd.TABLES}
    algo_map = {1: pd.ALGORITHMS[0], 2: pd.ALGORITHMS[1], 3: pd.ALGORITHMS[2]}

    for sec in pd.SECTIONS:
        add_h1(sec["title"])
        for sub in sec["subsections"]:
            if sub["subtitle"]:
                add_h2(sub["subtitle"])
            for p_text in sub["paragraphs"]:
                add_p(p_text)

        # Strategic embedding of visuals after sections
        if sec["id"] == "III":
            add_fig("docs/paper/figures/fig1_architecture.png", "Fig. 1. End-to-end NyayaLens system architecture illustrating multi-stage fault-isolated dataflow from local ingestion to knowledge graph synthesis and verifiable Q&A.")
        elif sec["id"] == "IV":
            add_tbl(table_map["I"])
            add_tbl(table_map["II"])
        elif sec["id"] == "V":
            add_algo(algo_map[1])
        elif sec["id"] == "VI":
            add_algo(algo_map[2])
        elif sec["id"] == "VIII":
            add_fig("docs/paper/figures/fig4_llm_blender.png", "Fig. 4. Evidence-conditioned LLM-Blender architecture: candidate responses generated by local SLMs are ranked by PairRanker and synthesized via GenFuser with exact span fallback.")
            add_algo(algo_map[3])
        elif sec["id"] == "X":
            add_tbl(table_map["III"])
            add_tbl(table_map["IV"])
            add_fig("docs/paper/figures/fig2_f1.png", "Fig. 2. Micro-averaged F1 extraction scores across the Seed-2027 held-out test and cross-domain splits.")
            add_fig("docs/paper/figures/fig5_domain_breakdown.png", "Fig. 5. Multi-metric performance breakdown across the seven legal domains on the held-out test partition.")
            add_tbl(table_map["V"])
            add_tbl(table_map["VI"])
            add_fig("docs/paper/figures/fig6_consistency_recall.png", "Fig. 6. Anomaly detection recall rates across nine inconsistency categories on the adversarial test corpus.")
            add_tbl(table_map["VII"])
            add_tbl(table_map["VIII"])
            add_fig("docs/paper/figures/fig3_qa.png", "Fig. 3. Question answering correctness across five benchmark query topologies.")
            add_tbl(table_map["IX"])
        elif sec["id"] == "XI":
            add_tbl(table_map["X"])

    # References Section
    add_h1("REFERENCES")
    for ref_str in pd.REFERENCES:
        p_ref = doc.add_paragraph()
        p_ref.paragraph_format.space_before = Pt(0)
        p_ref.paragraph_format.space_after = Pt(2.5)
        p_ref.paragraph_format.line_spacing = 1.05
        p_ref.paragraph_format.first_line_indent = Inches(-0.2)
        p_ref.paragraph_format.left_indent = Inches(0.2)
        p_ref.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        r_ref = p_ref.add_run(ref_str)
        r_ref.font.name = 'Times New Roman'
        r_ref.font.size = Pt(8)

    doc.save(output_path)
    print(f"DOCX successfully created: {output_path}")

def build_markdown(output_path):
    print(f"Building Markdown: {output_path}...")
    lines = []
    lines.append(f"# {pd.TITLE}\n")
    lines.append(f"**Authors:** {pd.AUTHORS[0]['name']} and {pd.AUTHORS[1]['name']}  ")
    lines.append(f"*{pd.AUTHORS[0]['dept']}, {pd.AUTHORS[0]['school']}, {pd.AUTHORS[0]['univ']}*  ")
    lines.append(f"Emails: `{pd.AUTHORS[0]['email']}`, `{pd.AUTHORS[1]['email']}`\n")
    lines.append("## Abstract\n")
    lines.append(pd.ABSTRACT + "\n")
    lines.append(f"**Index Terms:** *{pd.INDEX_TERMS}*\n")

    for sec in pd.SECTIONS:
        lines.append(f"\n## {sec['title']}\n")
        for sub in sec["subsections"]:
            if sub["subtitle"]:
                lines.append(f"\n### {sub['subtitle']}\n")
            for p in sub["paragraphs"]:
                lines.append(f"{p}\n")
        
        if sec["id"] == "III":
            lines.append("\n![Fig. 1 System Architecture](paper/figures/fig1_architecture.png)\n*Fig. 1. End-to-end NyayaLens system architecture.* \n")
        elif sec["id"] == "VIII":
            lines.append("\n![Fig. 4 LLM-Blender Architecture](paper/figures/fig4_llm_blender.png)\n*Fig. 4. LLM-Blender integration with PairRanker and GenFuser.* \n")
        elif sec["id"] == "X":
            lines.append("\n![Fig. 2 F1 Scores](paper/figures/fig2_f1.png)\n*Fig. 2. F1 extraction scores.* \n")
            lines.append("\n![Fig. 5 Domain Breakdown](paper/figures/fig5_domain_breakdown.png)\n*Fig. 5. Per-domain performance breakdown.* \n")
            lines.append("\n![Fig. 6 Consistency Recall](paper/figures/fig6_consistency_recall.png)\n*Fig. 6. Anomaly detection recall.* \n")
            lines.append("\n![Fig. 3 QA Accuracy](paper/figures/fig3_qa.png)\n*Fig. 3. Question answering accuracy.* \n")

    lines.append("\n## References\n")
    for ref in pd.REFERENCES:
        lines.append(f"- {ref}\n")

    with open(output_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"Markdown successfully created: {output_path}")

def build_html(output_path):
    print(f"Building HTML: {output_path}...")
    html = []
    html.append("<!doctype html><html lang='en'><head><meta charset='utf-8'>")
    html.append(f"<title>{pd.TITLE}</title>")
    html.append("<style>")
    html.append("@page{size:Letter;margin:0.75in 0.75in 0.9in 0.75in}")
    html.append("body{font:9.5pt/1.2 'Times New Roman',Times,serif;margin:0;color:#000;background:#fff}")
    html.append(".head{text-align:center;margin-bottom:12pt;padding:0 20pt}")
    html.append(".head h1{font-size:20pt;line-height:1.15;margin:0 0 10pt;font-weight:bold}")
    html.append(".auth-grid{display:flex;justify-content:center;gap:40pt;margin-bottom:12pt}")
    html.append(".auth-col{text-align:center}.auth-col .name{font-size:11pt;font-weight:bold}.auth-col .affil{font-size:9.5pt}.auth-col .email{font-size:9.5pt;font-style:italic}")
    html.append(".abs-box{padding:0 15pt;margin-bottom:14pt;text-align:justify}")
    html.append(".abs-box p{margin:3pt 0;text-indent:0}.abs-lead{font-weight:bold;font-style:italic}")
    html.append(".cols{column-count:2;column-gap:0.25in;text-align:justify;hyphens:auto;padding:0 10pt}")
    html.append("p{margin:0 0 3.5pt;text-indent:0.18in}")
    html.append("h2{font-size:10pt;text-align:center;font-weight:bold;margin:10pt 0 3pt;break-after:avoid;text-transform:uppercase}")
    html.append("h3{font-size:9.5pt;text-align:left;font-weight:bold;font-style:italic;margin:6pt 0 2pt;break-after:avoid}")
    html.append("table{border-collapse:collapse;width:100%;font-size:7.5pt;margin:4pt 0 7pt;break-inside:avoid}")
    html.append("th,td{padding:2pt 3pt;text-align:center;border-bottom:0.4pt solid #ddd}th{font-weight:bold;border-top:0.8pt solid #000;border-bottom:0.8pt solid #000}td:first-child,th:first-child{text-align:left}tbody tr:last-child td{border-bottom:0.8pt solid #000}")
    html.append(".tcap{font-size:7.5pt;text-align:center;font-weight:bold;margin-top:6pt;break-after:avoid}")
    html.append("figure{margin:6pt 0;text-align:center;break-inside:avoid}figure img{width:100%;height:auto}")
    html.append("figcaption{font-size:7.5pt;font-style:italic;text-align:justify;margin-top:2pt}")
    html.append(".algo{border:0.8pt solid #000;padding:4pt 6pt;font-family:'Courier New',monospace;font-size:7pt;margin:5pt 0;break-inside:avoid;text-align:left;background:#fafafa}")
    html.append(".algo-title{font-family:'Times New Roman',serif;font-size:8pt;font-weight:bold;margin-bottom:2pt}")
    html.append(".ref{font-size:8pt;text-indent:-0.2in;padding-left:0.2in;margin-bottom:2.5pt;text-align:justify;overflow-wrap:anywhere}")
    html.append("</style></head><body>")

    # Header
    html.append("<div class='head'>")
    html.append(f"<h1>{pd.TITLE}</h1>")
    html.append("<div class='auth-grid'>")
    for auth in pd.AUTHORS:
        html.append(f"<div class='auth-col'><div class='name'>{auth['name']}</div><div class='affil'>{auth['dept']}<br>{auth['school']}<br>{auth['univ']}</div><div class='email'>{auth['email']}</div></div>")
    html.append("</div>")
    html.append("<div class='abs-box'>")
    html.append(f"<p><span class='abs-lead'>Abstract—</span><b>{pd.ABSTRACT}</b></p>")
    html.append(f"<p><span class='abs-lead'>Index Terms—</span><i>{pd.INDEX_TERMS}</i></p>")
    html.append("</div></div>")

    # Two column body
    html.append("<div class='cols'>")

    for sec in pd.SECTIONS:
        html.append(f"<h2>{sec['title']}</h2>")
        for sub in sec["subsections"]:
            if sub["subtitle"]:
                html.append(f"<h3>{sub['subtitle']}</h3>")
            for p in sub["paragraphs"]:
                html.append(f"<p>{p}</p>")
        
        if sec["id"] == "III":
            html.append("<figure><img src='figures/fig1_architecture.png'><figcaption>Fig. 1. End-to-end NyayaLens system architecture.</figcaption></figure>")
        elif sec["id"] == "VIII":
            html.append("<figure><img src='figures/fig4_llm_blender.png'><figcaption>Fig. 4. LLM-Blender evidence-conditioned ranking and generative fusion.</figcaption></figure>")
        elif sec["id"] == "X":
            html.append("<figure><img src='figures/fig2_f1.png'><figcaption>Fig. 2. Extraction F1 scores across test and cross-domain splits.</figcaption></figure>")
            html.append("<figure><img src='figures/fig5_domain_breakdown.png'><figcaption>Fig. 5. Multi-metric performance breakdown across seven domains.</figcaption></figure>")
            html.append("<figure><img src='figures/fig6_consistency_recall.png'><figcaption>Fig. 6. Anomaly detection recall rates across nine inconsistency categories.</figcaption></figure>")
            html.append("<figure><img src='figures/fig3_qa.png'><figcaption>Fig. 3. Question answering correctness by topology.</figcaption></figure>")

    html.append("<h2>REFERENCES</h2>")
    for ref in pd.REFERENCES:
        html.append(f"<div class='ref'>{ref}</div>")

    html.append("</div></body></html>")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("".join(html))
    print(f"HTML successfully created: {output_path}")

if __name__ == "__main__":
    docx_path = os.path.abspath("docs/paper/NyayaLens_IEEE_paper.docx")
    html_path = os.path.abspath("docs/paper/paper.html")
    md_path = os.path.abspath("docs/research_paper.md")

    build_docx(docx_path)
    build_markdown(md_path)
    build_html(html_path)
    print("\nALL 3 FORMATS BUILT PERFECTLY!")
