"""Structural check on the generated Word appendix.

Word's own layout engine is the only thing that can tell you exactly where a page breaks,
and it is not available in CI. What *is* checkable without it is the class of defect that
actually ruins a printed appendix: a table wider than the text column, a style referenced
but never defined, a broken relationship, malformed XML. This script asserts those, so the
document is known-sound even where its pagination has not been eyeballed.

    python docs/verify_stack_doc.py docs/GSIH-Technology-Stack.docx
"""

from __future__ import annotations

import re
import sys
import zipfile
from xml.etree import ElementTree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def fail(message: str) -> None:
    print(f"FAIL  {message}")
    sys.exit(1)


def main(path: str) -> None:
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        for required in ("word/document.xml", "word/styles.xml", "[Content_Types].xml"):
            if required not in names:
                fail(f"{path} is missing {required}")

        # Well-formed XML in every part, not just the ones we go on to read.
        for name in names:
            if name.endswith(".xml") or name.endswith(".rels"):
                try:
                    ElementTree.fromstring(archive.read(name))
                except ElementTree.ParseError as broken:
                    fail(f"{name} is not well-formed XML: {broken}")

        document = archive.read("word/document.xml").decode("utf-8")
        styles = archive.read("word/styles.xml").decode("utf-8")

    # Page geometry: the text column is the page minus its margins.
    page = re.search(r'<w:pgSz w:w="(\d+)" w:h="(\d+)"', document)
    margins = re.search(r'<w:pgMar w:top="(\d+)" w:right="(\d+)" w:bottom="(\d+)" w:left="(\d+)"', document)
    if not page or not margins:
        fail("no section properties — Word will apply its own defaults, not the ones intended")

    page_width = int(page.group(1))
    content_width = page_width - int(margins.group(2)) - int(margins.group(4))

    # Every table has to fit the text column. A table one twip too wide is the classic way
    # an appendix prints with its last column sliced off, and it is invisible on screen.
    tables = re.findall(r"<w:tblGrid>(.*?)</w:tblGrid>", document, re.S)
    if not tables:
        fail("no tables found — the appendix is built around them, so this is a build failure")

    for index, grid in enumerate(tables, start=1):
        widths = [int(w) for w in re.findall(r'<w:gridCol w:w="(\d+)"', grid)]
        total = sum(widths)
        if total > content_width:
            fail(
                f"table {index} is {total} twips wide against a {content_width} twip text column "
                f"— it will print with columns cut off"
            )

    # A style that is referenced but not defined silently falls back to Normal, which is how
    # a document ends up with headings that are not headings.
    referenced = set(re.findall(r'<w:pStyle w:val="([^"]+)"', document))
    defined = set(re.findall(r'<w:style [^>]*w:styleId="([^"]+)"', styles))
    missing = sorted(referenced - defined)
    if missing:
        fail(f"styles used but never defined: {', '.join(missing)}")

    paragraphs = document.count("<w:p ") + document.count("<w:p>")
    words = len(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", document))

    print(f"OK    {path}")
    print(f"      {len(tables)} tables, all within the {content_width}-twip text column")
    print(f"      {len(referenced)} styles referenced, all defined")
    print(f"      {paragraphs} paragraphs, {words} text runs")
    print("      Note: page-break positions still require Word or LibreOffice to confirm.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "docs/GSIH-Technology-Stack.docx")
