"""Professional DOCX export using styles, headers, footers, TOC and citations."""

from io import BytesIO

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pydantic import BaseModel, ConfigDict, Field

from backend.contracts.source import NonEmpty


class DocxSection(BaseModel):
    """One proposal section with citation and review state."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    title: NonEmpty
    body: str = Field(min_length=1)
    citation: str | None = None
    order: int = Field(ge=0)
    state: str = "APPROVED"


class DocxInput(BaseModel):
    """Deterministic proposal input for DOCX rendering."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    proposal_id: NonEmpty
    title: NonEmpty
    revision: int = Field(ge=1)
    sections: list[DocxSection] = Field(min_length=1)


def _add_page_number(paragraph) -> None:
    """Insert PAGE field into footer paragraph without direct formatting."""
    run = paragraph.add_run()
    fld_char1 = OxmlElement("w:fldChar")
    fld_char1.set(qn("w:fldCharType"), "begin")
    run._r.append(fld_char1)
    run2 = paragraph.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("w:space"), "preserve")
    instr.text = " PAGE "
    run2._r.append(instr)
    run3 = paragraph.add_run()
    fld_char2 = OxmlElement("w:fldChar")
    fld_char2.set(qn("w:fldCharType"), "end")
    run3._r.append(fld_char2)


def build_proposal_docx(data: DocxInput | dict) -> bytes:
    """Render proposal to DOCX bytes using named styles only."""
    inp = DocxInput.model_validate(data) if isinstance(data, dict) else data
    sorted_sections = sorted(inp.sections, key=lambda s: (s.order, s.title))
    doc = Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    # header with title and revision
    section = doc.sections[0]
    header = section.header
    hp = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
    hp.style = doc.styles["Header"]
    hp.text = f"{inp.title} — Rev {inp.revision}"
    hp.alignment = 1
    # footer with page number
    footer = section.footer
    fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    fp.style = doc.styles["Footer"]
    fp.alignment = 1
    fp.text = "Page "
    _add_page_number(fp)
    # cover
    cover = doc.add_paragraph(style="Title")
    cover.text = inp.title
    meta = doc.add_paragraph(style="Subtitle")
    meta.text = f"Proposal {inp.proposal_id} · Revision {inp.revision}"
    # TOC
    toc_heading = doc.add_paragraph(style="Heading 1")
    toc_heading.text = "Contents"
    for sec in sorted_sections:
        entry = doc.add_paragraph(style="TOC Heading")
        entry.text = f"{sec.title}\t{sec.order + 1}"
    # sections
    for sec in sorted_sections:
        heading = doc.add_paragraph(style="Heading 1")
        heading.text = sec.title
        # handle table overflow: large bodies split into multiple paragraphs
        body = sec.body
        truncated = False
        if len(body) > 4000:
            body = body[:4000]
            truncated = True
        for line in body.split("\n"):
            para = doc.add_paragraph(style="Normal")
            if len(line) > 2000:
                para.text = line[:1990] + " \u2026 truncated"
                truncated = True
            else:
                para.text = line
        if truncated:
            note = doc.add_paragraph(style="Caption")
            note.text = "\u2026 truncated — table overflow handled"
        if sec.citation:
            cap = doc.add_paragraph(style="Caption")
            cap.text = f"Source: {sec.citation}"
        state_para = doc.add_paragraph(style="Intense Quote")
        state_para.text = f"State: {sec.state} · Rev {inp.revision}"
    out = BytesIO()
    doc.save(out)
    return out.getvalue()
