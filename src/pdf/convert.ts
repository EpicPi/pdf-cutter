import {
  EncryptedPDFError,
  PDFDocument,
  PrintScaling,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib'

import {
  getCenteredPlacement,
  getDisplayHalfClipBox,
  getDisplayedPageGeometry,
  getLongAxisHalfOrder,
  getOutputRotation,
  intersectPageBoxes,
  type DisplayHalf,
  type PageBox,
} from './geometry'

export interface PdfInspection {
  inputPages: number
  outputPages: number
}

export interface PdfConversion extends PdfInspection {
  bytes: Uint8Array
}

export type ProgressCallback = (completedPages: number, totalPages: number) => void
export type LabelPlacement = 'corner' | 'center'

export interface PdfConversionOptions {
  labelPlacement?: LabelPlacement
}

const LABEL_FONT_SIZE = 34
const LABEL_INSET = 18
const LABEL_OPACITY = 0.85
const LABEL_GRAY = 0.45

export class PdfCutterError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'encrypted'
      | 'invalid-pdf'
      | 'empty-pdf'
      | 'does-not-fit'
      | 'unsupported-page',
  ) {
    super(message)
    this.name = 'PdfCutterError'
  }
}

interface PreparedPage {
  page: PDFPage
  box: PageBox
  rotation: number
  halves: readonly [DisplayHalf, DisplayHalf]
}

function formatPoints(points: number): string {
  return `${points.toFixed(1)} pt`
}

function getPreparedPages(document: PDFDocument): PreparedPage[] {
  const pages = document.getPages()

  if (pages.length === 0) {
    throw new PdfCutterError('This PDF does not contain any pages.', 'empty-pdf')
  }

  const invalidPages: string[] = []
  const preparedPages = pages.map((page, index) => {
    let box: PageBox

    try {
      box = intersectPageBoxes(page.getMediaBox(), page.getCropBox())
    } catch {
      throw new PdfCutterError(
        `Page ${index + 1} has an invalid visible page area.`,
        'unsupported-page',
      )
    }

    const rotation = page.getRotation().angle
    let displayed

    try {
      displayed = getDisplayedPageGeometry(box, rotation)
    } catch {
      throw new PdfCutterError(
        `Page ${index + 1} uses an unsupported rotation.`,
        'unsupported-page',
      )
    }

    const halves = getLongAxisHalfOrder(box, rotation)

    try {
      const outputRotation = getOutputRotation(rotation)
      for (const half of halves) {
        const clip = getDisplayHalfClipBox(box, rotation, half)
        getCenteredPlacement(clip.right - clip.left, clip.top - clip.bottom, outputRotation)
      }
    } catch {
      invalidPages.push(
        `${index + 1} (${formatPoints(displayed.width)} × ${formatPoints(displayed.height)})`,
      )
    }

    return { page, box, rotation, halves }
  })

  if (invalidPages.length > 0) {
    const pageWord = invalidPages.length === 1 ? 'Page' : 'Pages'
    throw new PdfCutterError(
      `${pageWord} ${invalidPages.join(', ')} ${
        invalidPages.length === 1 ? 'is' : 'are'
      } cannot fit on Letter at full size after one halfway cut along the long side.`,
      'does-not-fit',
    )
  }

  return preparedPages
}

async function loadAndValidate(bytes: ArrayBuffer | Uint8Array): Promise<{
  document: PDFDocument
  pages: PreparedPage[]
}> {
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false })
    return { document, pages: getPreparedPages(document) }
  } catch (error) {
    if (error instanceof PdfCutterError) throw error

    if (error instanceof EncryptedPDFError) {
      throw new PdfCutterError(
        'Password-protected PDFs are not supported. Please unlock the file and try again.',
        'encrypted',
      )
    }

    throw new PdfCutterError(
      'This file could not be read as a PDF. It may be damaged or use an unsupported format.',
      'invalid-pdf',
    )
  }
}

export async function inspectPdf(bytes: ArrayBuffer | Uint8Array): Promise<PdfInspection> {
  const { pages } = await loadAndValidate(bytes)
  return { inputPages: pages.length, outputPages: pages.length * 2 }
}

function hasPageContents(page: PDFPage): boolean {
  return page.node.Contents() !== undefined
}

function getLabelPosition(
  placement: ReturnType<typeof getCenteredPlacement>,
  labelWidth: number,
  labelHeight: number,
  labelPlacement: LabelPlacement,
): { x: number; y: number } {
  if (labelPlacement === 'center') {
    const centerX = placement.marginX + placement.width / 2
    const centerY = placement.marginY + placement.height / 2

    switch (placement.rotation) {
      case 0:
        return { x: centerX - labelWidth / 2, y: centerY - labelHeight / 2 }
      case 90:
        return { x: centerX + labelHeight / 2, y: centerY - labelWidth / 2 }
      case 180:
        return { x: centerX + labelWidth / 2, y: centerY + labelHeight / 2 }
      case 270:
        return { x: centerX - labelHeight / 2, y: centerY + labelWidth / 2 }
    }
  }

  const right = placement.marginX + placement.width - LABEL_INSET
  const bottom = placement.marginY + LABEL_INSET

  switch (placement.rotation) {
    case 0:
      return { x: right - labelWidth, y: bottom }
    case 90:
      return { x: right, y: bottom }
    case 180:
      return { x: right, y: bottom + labelHeight }
    case 270:
      return { x: right - labelHeight, y: bottom + labelWidth }
  }
}

async function addHalfPage(
  output: PDFDocument,
  source: PreparedPage,
  half: DisplayHalf,
  label: string,
  labelFont: PDFFont,
  labelPlacement: LabelPlacement,
): Promise<void> {
  const clipBox = getDisplayHalfClipBox(source.box, source.rotation, half)
  const outputRotation = getOutputRotation(source.rotation)
  const placement = getCenteredPlacement(
    clipBox.right - clipBox.left,
    clipBox.top - clipBox.bottom,
    outputRotation,
  )
  const outputPage = output.addPage([placement.pageWidth, placement.pageHeight])

  if (hasPageContents(source.page)) {
    const embeddedPage = await output.embedPage(source.page, clipBox)

    outputPage.drawPage(embeddedPage, {
      x: placement.x,
      y: placement.y,
      xScale: 1,
      yScale: 1,
      rotate: degrees(placement.rotation),
    })
  }

  const labelWidth = labelFont.widthOfTextAtSize(label, LABEL_FONT_SIZE)
  const labelHeight = labelFont.heightAtSize(LABEL_FONT_SIZE, { descender: false })
  const labelPosition = getLabelPosition(
    placement,
    labelWidth,
    labelHeight,
    labelPlacement,
  )
  outputPage.drawText(label, {
    ...labelPosition,
    size: LABEL_FONT_SIZE,
    font: labelFont,
    color: rgb(LABEL_GRAY, LABEL_GRAY, LABEL_GRAY),
    opacity: LABEL_OPACITY,
    rotate: degrees(placement.rotation),
  })
}

export async function convertPdf(
  bytes: ArrayBuffer | Uint8Array,
  onProgress?: ProgressCallback,
  options: PdfConversionOptions = {},
): Promise<PdfConversion> {
  const { document: sourceDocument, pages } = await loadAndValidate(bytes)
  const output = await PDFDocument.create()

  const title = sourceDocument.getTitle()
  const subject = sourceDocument.getSubject()
  const author = sourceDocument.getAuthor()
  if (title !== undefined) output.setTitle(title)
  if (subject !== undefined) output.setSubject(subject)
  if (author !== undefined) output.setAuthor(author)
  output.setCreator('PDF Half-Cutter')
  output.setProducer('PDF Half-Cutter')
  output.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None)
  const labelFont = await output.embedFont(StandardFonts.HelveticaBold)
  const labelPlacement = options.labelPlacement ?? 'corner'

  let completedPages = 0
  const totalPages = pages.length * 2

  for (const [sourceIndex, source] of pages.entries()) {
    const sourcePageNumber = sourceIndex + 1
    await addHalfPage(
      output,
      source,
      source.halves[0],
      `${sourcePageNumber}A`,
      labelFont,
      labelPlacement,
    )
    completedPages += 1
    onProgress?.(completedPages, totalPages)

    await addHalfPage(
      output,
      source,
      source.halves[1],
      `${sourcePageNumber}B`,
      labelFont,
      labelPlacement,
    )
    completedPages += 1
    onProgress?.(completedPages, totalPages)
  }

  const outputBytes = await output.save({ addDefaultPage: false, useObjectStreams: true })

  return {
    bytes: outputBytes,
    inputPages: pages.length,
    outputPages: totalPages,
  }
}
