# scripts/build_paper.py
"""
Build script for NyayaLens IEEE Comprehensive Research Paper (10-12 pages).
Generates:
  1. docs/paper/NyayaLens_IEEE_paper.docx (IEEE formatted, 2-column, side-by-side author names, 6 figures, 10 tables, 3 algorithms)
  2. docs/paper/paper.html (HTML preview)
  3. docs/research_paper.md (Markdown source)
"""

import os
import sys
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

print("Starting paper build...")
