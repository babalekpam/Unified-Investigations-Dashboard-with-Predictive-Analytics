/**
 * Shared house style for the Word documents in this pack.
 *
 * Two documents are generated from here — the technical specification and the executive
 * brief — and they have to look like they came from the same organisation. Keeping the
 * tokens and the table, heading and callout builders in one place is what makes that true
 * by construction rather than by careful copying.
 */

const {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} = require('docx')

/* ------------------------------------------------------------------ tokens */

// The AT&T brand palette: #067ab4, #3aa5dc, #ff7200, #fcb314. The deep blue carries the
// chrome — filled header rows with white type on them, section rules — because it is the
// only one of the four that holds its own against white (4.7:1). Headings take a darker
// step of the same hue so they survive greyscale printing, and the accent orange appears
// once, on the part divider, rather than competing with the blue throughout.
const BRAND = '067AB4'
const BRAND_LIGHT = '3AA5DC'
const ACCENT = 'FF7200'
const GOLD = 'FCB314'
const HEADING = '05537A'
const SUBHEAD = '067AB4'
const INK = '111A21'
const INK_2 = '4B5964'
const MUTED = '6F7D89'
const RULE = 'DCE3E9'
const ZEBRA = 'F2F8FC'

const CONTENT_WIDTH = 10080 // US Letter (12240) less 0.75" margins each side

/* ------------------------------------------------------------------ helpers */

const text = (value, opts = {}) =>
  new TextRun({ text: value, font: 'Calibri', size: 20, color: INK, ...opts })

const para = (value, opts = {}) => {
  const { children, ...rest } = opts
  return new Paragraph({
    spacing: { after: 140, line: 276 },
    children: children ?? [text(value)],
    ...rest,
  })
}

const h1 = (value) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND, space: 6 } },
    children: [new TextRun({ text: value, font: 'Calibri', size: 30, bold: true, color: HEADING })],
  })

const h2 = (value) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 110 },
    children: [new TextRun({ text: value, font: 'Calibri', size: 24, bold: true, color: SUBHEAD })],
  })

const h3 = (value) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text: value, font: 'Calibri', size: 21, bold: true, color: INK })],
  })

const bullet = (value, opts = {}) =>
  new Paragraph({
    numbering: { reference: 'bullets', level: 0 },
    spacing: { after: 70, line: 276 },
    children: opts.children ?? [text(value)],
  })

const note = (value) =>
  new Paragraph({
    spacing: { before: 120, after: 160 },
    indent: { left: 240 },
    border: { left: { style: BorderStyle.SINGLE, size: 14, color: BRAND, space: 10 } },
    children: [text(value, { italics: true, color: INK_2 })],
  })

const cell = (content, opts = {}) => {
  const { width, shading, bold, color, size, align } = opts
  const paragraphs = Array.isArray(content) ? content : [content]
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: shading ? { type: ShadingType.CLEAR, fill: shading, color: 'auto' } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: paragraphs.map(
      (value) =>
        new Paragraph({
          alignment: align,
          spacing: { after: 0, line: 250 },
          children: [
            new TextRun({
              text: value,
              font: 'Calibri',
              size: size ?? 18,
              bold,
              color: color ?? INK,
            }),
          ],
        }),
    ),
  })
}

/**
 * A table with a brand-filled header row.
 *
 * Column widths must sum to the table width, and every cell repeats its own width —
 * percentage widths render incorrectly outside Word.
 */
const table = (headers, rows, widths) =>
  new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: RULE },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((label, i) =>
          cell(label, { width: widths[i], shading: BRAND, bold: true, color: 'FFFFFF' }),
        ),
      }),
      ...rows.map(
        (row, index) =>
          new TableRow({
            children: row.map((value, i) =>
              cell(value, {
                width: widths[i],
                shading: index % 2 === 1 ? ZEBRA : undefined,
              }),
            ),
          }),
      ),
    ],
  })

const spacer = () => new Paragraph({ spacing: { after: 200 }, children: [] })

/** A full-width part divider. Three of these carve the document into its three questions. */
const part = (number, title, standfirst) => [
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({
    spacing: { before: 200, after: 0 },
    children: [
      new TextRun({
        text: `PART ${number}`,
        font: 'Calibri',
        size: 20,
        bold: true,
        color: ACCENT,
        characterSpacing: 80,
      }),
    ],
  }),
  new Paragraph({
    spacing: { before: 60, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 8 } },
    children: [
      new TextRun({ text: title, font: 'Calibri', size: 44, bold: true, color: HEADING }),
    ],
  }),
  new Paragraph({
    spacing: { after: 240 },
    children: [new TextRun({ text: standfirst, font: 'Calibri', size: 22, color: INK_2 })],
  }),
]

/* ------------------------------------------------------------------ page furniture */

/** Numbering config for bullet lists; both documents share the one reference. */
const numbering = {
  config: [
    {
      reference: 'bullets',
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: '\u2022',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 460, hanging: 240 } } },
        },
      ],
    },
  ],
}

const pageProperties = {
  page: {
    size: { width: 12240, height: 15840 },
    margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
  },
}

const runningHead = (label) =>
  new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 60 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 4 } },
        children: [new TextRun({ text: label, font: 'Calibri', size: 16, color: MUTED })],
      }),
    ],
  })

const pageFooter = () =>
  new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: 'Page ', font: 'Calibri', size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.CURRENT], font: 'Calibri', size: 16, color: MUTED }),
          new TextRun({ text: ' of ', font: 'Calibri', size: 16, color: MUTED }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Calibri', size: 16, color: MUTED }),
        ],
      }),
    ],
  })

/** The shared cover: an eyebrow, a title, a rule, and a subtitle. */
const cover = (eyebrow, title, subtitle, standfirst, titleSize = 54) => [
  new Paragraph({
    spacing: { before: 1400, after: 0 },
    children: [
      new TextRun({
        text: eyebrow,
        font: 'Calibri',
        size: 20,
        bold: true,
        color: SUBHEAD,
        characterSpacing: 60,
      }),
    ],
  }),
  new Paragraph({
    spacing: { before: 120, after: 60 },
    children: [
      new TextRun({ text: title, font: 'Calibri', size: titleSize, bold: true, color: HEADING }),
    ],
  }),
  new Paragraph({
    spacing: { after: 260 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: BRAND, space: 10 } },
    children: [new TextRun({ text: subtitle, font: 'Calibri', size: 30, color: INK_2 })],
  }),
  para('', {
    children: [text(standfirst, { size: 22, color: INK_2 })],
  }),
]

/** The metadata block that closes a cover page: who wrote it, what it companions, status. */
const coverMeta = (rows) => [
  spacer(),
  table(['Field', 'Detail'], rows, [2600, 7480]),
  new Paragraph({ children: [new PageBreak()] }),
]

module.exports = {
  BRAND,
  BRAND_LIGHT,
  ACCENT,
  GOLD,
  HEADING,
  SUBHEAD,
  INK,
  INK_2,
  MUTED,
  RULE,
  ZEBRA,
  CONTENT_WIDTH,
  text,
  para,
  h1,
  h2,
  h3,
  bullet,
  note,
  cell,
  table,
  spacer,
  part,
  numbering,
  pageProperties,
  runningHead,
  pageFooter,
  cover,
  coverMeta,
}
