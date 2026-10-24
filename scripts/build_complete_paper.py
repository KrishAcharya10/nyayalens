# scripts/build_complete_paper.py
"""
Complete script to generate the 10-12 page IEEE formatted paper for NyayaLens.
"""

import os
import sys
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def create_element(name):
    return OxmlElement(name)

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

def set_cell_margins(cell, top=50, bottom=50, left=80, right=80):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def add_ieee_table(doc, headers, data, col_widths=None, alignment=WD_TABLE_ALIGNMENT.CENTER):
    table = doc.add_table(rows=len(data) + 1, cols=len(headers))
    table.alignment = alignment
    table.autofit = False

    hdr_cells = table.rows[0].cells
    for i, header_text in enumerate(headers):
        hdr_cells[i].text = header_text
        if col_widths and i < len(col_widths):
            hdr_cells[i].width = col_widths[i]
        set_cell_border(hdr_cells[i], top={"val": "single", "sz": "10", "color": "000000"},
                                      bottom={"val": "single", "sz": "8", "color": "000000"})
        set_cell_margins(hdr_cells[i], top=70, bottom=70, left=70, right=70)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(1.5)
        p.paragraph_format.space_after = Pt(1.5)
        for run in p.runs:
            run.font.name = 'Times New Roman'
            run.font.size = Pt(8)
            run.font.bold = True

    for r_idx, row_data in enumerate(data):
        row_cells = table.rows[r_idx + 1].cells
        is_last_row = (r_idx == len(data) - 1)
        for c_idx, val in enumerate(row_data):
            row_cells[c_idx].text = str(val)
            if col_widths and c_idx < len(col_widths):
                row_cells[c_idx].width = col_widths[c_idx]
            
            border_kwargs = {}
            if is_last_row:
                border_kwargs["bottom"] = {"val": "single", "sz": "10", "color": "000000"}
            else:
                border_kwargs["bottom"] = {"val": "single", "sz": "4", "color": "D8D8D8"}
            set_cell_border(row_cells[c_idx], **border_kwargs)
            set_cell_margins(row_cells[c_idx], top=40, bottom=40, left=70, right=70)

            p = row_cells[c_idx].paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT if c_idx == 0 else WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(1)
            p.paragraph_format.space_after = Pt(1)
            for run in p.runs:
                run.font.name = 'Times New Roman'
                run.font.size = Pt(7.5)
                if is_last_row and ('Total' in str(row_data[0]) or 'Overall' in str(row_data[0])):
                    run.font.bold = True

    doc.add_paragraph().paragraph_format.space_after = Pt(3)
    return table

def add_heading_1(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(11)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.keep_with_next = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(10)
    run.font.bold = True
    return p

def add_heading_2(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(7)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(9.5)
    run.font.bold = True
    run.font.italic = True
    return p

def add_heading_3(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(5)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(9)
    run.font.italic = True
    return p

def add_body_p(doc, text, indent=True):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.15
    p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    if indent:
        p.paragraph_format.first_line_indent = Inches(0.18)
    run = p.add_run(text)
    run.font.name = 'Times New Roman'
    run.font.size = Pt(9.5)
    return p

def add_algorithm_box(doc, title, lines):
    p_title = doc.add_paragraph()
    p_title.paragraph_format.space_before = Pt(6)
    p_title.paragraph_format.space_after = Pt(2)
    p_title.paragraph_format.keep_with_next = True
    run_t = p_title.add_run(title)
    run_t.font.name = 'Times New Roman'
    run_t.font.size = Pt(8.5)
    run_t.font.bold = True

    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    cell = table.cell(0, 0)
    cell.width = Inches(3.35)
    set_cell_border(cell, top={"val": "single", "sz": "8", "color": "000000"},
                          bottom={"val": "single", "sz": "8", "color": "000000"})
    set_cell_margins(cell, top=50, bottom=50, left=70, right=70)
    
    cell.text = ""
    for idx, l in enumerate(lines):
        p = cell.add_paragraph() if idx > 0 else cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(1)
        p.paragraph_format.line_spacing = 1.05
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = p.add_run(l)
        run.font.name = 'Courier New' if l.startswith('  ') else 'Times New Roman'
        run.font.size = Pt(7.5)
        if 'Input:' in l or 'Output:' in l or 'Algorithm' in l:
            run.font.bold = True

    doc.add_paragraph().paragraph_format.space_after = Pt(3)

def add_figure_with_caption(doc, image_path, caption_text, width=Inches(3.35)):
    if not os.path.exists(image_path):
        print(f"Warning: image path {image_path} does not exist.")
        return
    p_img = doc.add_paragraph()
    p_img.paragraph_format.space_before = Pt(5)
    p_img.paragraph_format.space_after = Pt(2)
    p_img.paragraph_format.keep_with_next = True
    p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_img = p_img.add_run()
    run_img.add_picture(image_path, width=width)

    p_cap = doc.add_paragraph()
    p_cap.paragraph_format.space_before = Pt(2)
    p_cap.paragraph_format.space_after = Pt(5)
    p_cap.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    run_cap = p_cap.add_run(caption_text)
    run_cap.font.name = 'Times New Roman'
    run_cap.font.size = Pt(8)
    run_cap.font.italic = True

def add_table_caption(doc, table_num, title_text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(7)
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.keep_with_next = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run1 = p.add_run(f"TABLE {table_num}\n")
    run1.font.name = 'Times New Roman'
    run1.font.size = Pt(8)
    run1.font.bold = True
    run2 = p.add_run(title_text.upper())
    run2.font.name = 'Times New Roman'
    run2.font.size = Pt(7.5)
    run2.font.bold = True

print("Base setup ready.")
