#!/usr/bin/env python3
"""Style the pandoc-generated walkthrough.docx: cover page, heading colors,
shaded code blocks, table header row, and page numbers in the footer.

Usage: pandoc walkthrough.md -o walkthrough.docx --toc --toc-depth=2
       python3 scripts/style-walkthrough-docx.py docs/walkthrough.docx
"""
import sys
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Inches

HEADING_COLOR = RGBColor(0x1F, 0x4E, 0x79)   # dark professional blue
CODE_FILL = "F2F2F2"                         # light gray behind code blocks
TABLE_HEADER_FILL = "DEEAF6"                 # light blue table header row
ACCENT = RGBColor(0x2E, 0x74, 0xB5)


def shade_paragraph(p, fill):
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    pPr.append(shd)


def shade_cell(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), fill)
    tcPr.append(shd)


def add_page_number_footer(doc):
    for section in doc.sections:
        footer = section.footer
        p = footer.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run("Page ")
        run.font.size = Pt(9)
        fld = OxmlElement("w:fldSimple")
        fld.set(qn("w:instr"), r"PAGE \* MERGEFORMAT")
        r = OxmlElement("w:r")
        t = OxmlElement("w:t")
        t.text = "1"
        r.append(t)
        fld.append(r)
        p._p.append(fld)
        run2 = p.add_run(" of ")
        run2.font.size = Pt(9)
        fld2 = OxmlElement("w:fldSimple")
        fld2.set(qn("w:instr"), r"NUMPAGES \* MERGEFORMAT")
        r2 = OxmlElement("w:r")
        t2 = OxmlElement("w:t")
        t2.text = "1"
        r2.append(t2)
        fld2.append(r2)
        p._p.append(fld2)


def add_cover_page(doc):
    first = doc.paragraphs[0]
    spacer = first.insert_paragraph_before("")
    spacer.add_run("").add_break(WD_BREAK.LINE)  # breathing room
    title = first.insert_paragraph_before("DocuTrust")
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tr = title.add_run("DocuTrust")
    tr.font.size = Pt(40)
    tr.font.bold = True
    tr.font.color.rgb = HEADING_COLOR

    subtitle = first.insert_paragraph_before("DevSecOps Project 1 — Walkthrough")
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sr = subtitle.add_run("DevSecOps Project 1 — Walkthrough")
    sr.font.size = Pt(20)
    sr.font.color.rgb = ACCENT

    tagline = first.insert_paragraph_before(
        "SAST · Secrets Scanning · Live Secret Verification"
    )
    tagline.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tg = tagline.add_run("SAST · Secrets Scanning · Live Secret Verification")
    tg.font.size = Pt(13)
    tg.font.italic = True

    rule = first.insert_paragraph_before("")
    rule.alignment = WD_ALIGN_PARAGRAPH.CENTER
    rl = rule.add_run("— " * 12)
    rl.font.color.rgb = RGBColor(0xA6, 0xA6, 0xA6)

    note = first.insert_paragraph_before(
        "Every command in this walkthrough actually ran, and every output "
        "quoted is real captured output from the tools — with evidence files "
        "and screenshots cited along the way."
    )
    note.alignment = WD_ALIGN_PARAGRAPH.CENTER
    nr = note.add_run(
        "Every command in this walkthrough actually ran, and every output "
        "quoted is real captured output from the tools — with evidence files "
        "and screenshots cited along the way."
    )
    nr.font.size = Pt(10)
    nr.font.color.rgb = RGBColor(0x59, 0x59, 0x59)

    date_p = first.insert_paragraph_before("August 2026")
    date_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    dr = date_p.add_run("August 2026")
    dr.font.size = Pt(11)

    # page break after the cover
    brk = first.insert_paragraph_before("")
    brk.add_run("").add_break(WD_BREAK.PAGE)


def find_style(doc, name):
    # pandoc's reference docx trips python-docx's indexed lookup; iterate
    for st in doc.styles:
        if st.name == name:
            return st
    return None


def main(path):
    doc = Document(path)

    # --- styles ---------------------------------------------------------
    for name, size in (("Heading 1", 17), ("Heading 2", 13)):
        st = find_style(doc, name)
        if st is None:
            continue
        st.font.color.rgb = HEADING_COLOR
        st.font.size = Pt(size)
        st.font.bold = True

    # --- code blocks: shaded, tighter --------------------------------
    for p in doc.paragraphs:
        sname = p.style.name if p.style else ""
        if "Source Code" in sname or "SourceCode" in sname:
            shade_paragraph(p, CODE_FILL)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.space_before = Pt(0)

    # --- tables: header row shaded + bold -----------------------------
    for tbl in doc.tables:
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        for cell in tbl.rows[0].cells:
            shade_cell(cell, TABLE_HEADER_FILL)
            for p in cell.paragraphs:
                for r in p.runs:
                    r.font.bold = True

    add_page_number_footer(doc)
    add_cover_page(doc)
    doc.save(path)
    print(f"styled {path}: cover, heading colors, code shading, table headers, footer page numbers")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "docs/walkthrough.docx")
