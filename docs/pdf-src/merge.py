"""Appends chapter PDFs to base.pdf, adds them to the table of contents on page 2 and rewrites
every footer as "N / total" in the style of the original pages."""
import io
import json
import sys

from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT_PATHS = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/Library/Fonts/DejaVuSans.ttf',
]
TEXT = (0.1059, 0.1216, 0.1412)
FOOTER = (0.2039, 0.2039, 0.2039)
# Table of contents: second column of page 2, one line every 15.8 pt below "20.".
TOC_X_NUMBER = 304.8
TOC_X_TITLE = 323.0
TOC_LAST_TOP = 252.2
TOC_STEP = 15.75


def register_font():
    for path in FONT_PATHS:
        try:
            pdfmetrics.registerFont(TTFont('DejaVuSans', path))
            return
        except Exception:
            continue
    raise SystemExit('DejaVu Sans not found')


def overlay(width, height, draw):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(width, height))
    draw(c, width, height)
    c.save()
    buffer.seek(0)
    return PdfReader(buffer).pages[0]


def main(base_path, chapters_path, output_path):
    register_font()
    chapters = json.load(open(chapters_path))
    base = PdfReader(base_path)
    pages = list(base.pages)
    for chapter in chapters:
        pages.extend(PdfReader(chapter['pdf']).pages)
    total = len(pages)
    writer = PdfWriter()
    for index, page in enumerate(pages):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)

        def draw(c, w, h, index=index):
            # Cover the old footer and write the new one, 6 pt, centred 14 pt from the bottom.
            c.setFillColorRGB(1, 1, 1)
            c.rect(w / 2 - 30, h - 832, 60, 14, stroke=0, fill=1)
            c.setFillColorRGB(*FOOTER)
            c.setFont('DejaVuSans', 6)
            c.drawCentredString(w / 2, h - 826.4, f'{index + 1} / {total}')
            if index == 1:
                c.setFillColorRGB(*TEXT)
                c.setFont('DejaVuSans', 9.6)
                for i, chapter in enumerate(chapters):
                    top = TOC_LAST_TOP + TOC_STEP * (i + 1)
                    number, _, title = chapter['title'].partition(' ')
                    baseline = h - top - 7.4
                    c.drawString(TOC_X_NUMBER, baseline, number)
                    c.drawString(TOC_X_TITLE, baseline, title)

        page.merge_page(overlay(width, height, draw))
        writer.add_page(page)
    with open(output_path, 'wb') as handle:
        writer.write(handle)
    print(f'Wrote {output_path}: {total} pages')


if __name__ == '__main__':
    main(*sys.argv[1:4])
