import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  PrintScaling,
  decodePDFRawStream,
  degrees,
  rgb,
} from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import { PdfCutterError, convertPdf, inspectPdf } from '../../src/pdf/convert'
import { LETTER_LANDSCAPE, LETTER_PORTRAIT } from '../../src/pdf/geometry'

function getDecodedPageContents(document: PDFDocument, pageIndex: number): string {
  const contents = document.getPage(pageIndex).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []

  return streams
    .map((stream) => {
      const rawStream = document.context.lookup(stream, PDFRawStream)
      return new TextDecoder().decode(decodePDFRawStream(rawStream).decode())
    })
    .join('\n')
}

async function makeMixedSizePdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.setTitle('Pattern title')
  document.setSubject('Pattern subject')
  document.setAuthor('Pattern author')
  const a4 = document.addPage([595.2756, 841.8898])
  a4.drawRectangle({ x: 40, y: 660, width: 200, height: 80, color: rgb(0.1, 0.6, 0.4) })
  a4.drawRectangle({ x: 330, y: 100, width: 200, height: 80, color: rgb(0.9, 0.3, 0.2) })

  const custom = document.addPage([828, 648])
  custom.drawRectangle({ x: 80, y: 80, width: 120, height: 300, color: rgb(0.1, 0.6, 0.4) })
  custom.drawRectangle({ x: 600, y: 240, width: 120, height: 300, color: rgb(0.9, 0.3, 0.2) })
  return document.save()
}

describe('PDF conversion', () => {
  it('accepts mixed supported sizes and outputs centered Letter pages in the fitting orientation', async () => {
    const source = await makeMixedSizePdf()
    const inspection = await inspectPdf(source)
    const progress: number[] = []
    const result = await convertPdf(source, (completed) => progress.push(completed))
    const output = await PDFDocument.load(result.bytes)
    const pages = output.getPages()

    expect(inspection).toEqual({ inputPages: 2, outputPages: 4 })
    expect(result.inputPages).toBe(2)
    expect(result.outputPages).toBe(4)
    expect(progress).toEqual([1, 2, 3, 4])
    expect(pages).toHaveLength(4)
    expect(pages.slice(0, 2).map((page) => page.getSize())).toEqual([
      LETTER_PORTRAIT,
      LETTER_PORTRAIT,
    ])
    expect(pages.slice(2).map((page) => page.getSize())).toEqual([
      LETTER_LANDSCAPE,
      LETTER_LANDSCAPE,
    ])
    expect(output.catalog.getOrCreateViewerPreferences().getPrintScaling()).toBe(
      PrintScaling.None,
    )
    expect(output.getTitle()).toBe('Pattern title')
    expect(output.getSubject()).toBe('Pattern subject')
    expect(output.getAuthor()).toBe('Pattern author')
  })

  it('supports a visually portrait page represented by landscape dimensions plus rotation metadata', async () => {
    const source = await PDFDocument.create()
    const page = source.addPage([841.8898, 595.2756])
    page.setRotation(degrees(90))
    page.drawRectangle({ x: 100, y: 100, width: 100, height: 100, color: rgb(0, 0, 0) })

    const result = await convertPdf(await source.save())
    const output = await PDFDocument.load(result.bytes)

    expect(output.getPages().map((outputPage) => outputPage.getSize())).toEqual([
      LETTER_PORTRAIT,
      LETTER_PORTRAIT,
    ])
  })

  it('numbers output pages consecutively in the bottom-right corner', async () => {
    const source = await PDFDocument.create()
    source.addPage([595.2756, 841.8898])

    const result = await convertPdf(await source.save())
    const output = await PDFDocument.load(result.bytes)
    const firstPageContents = getDecodedPageContents(output, 0)
    const secondPageContents = getDecodedPageContents(output, 1)
    const firstPosition = firstPageContents.match(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/)

    expect(firstPageContents).toContain('<31> Tj')
    expect(secondPageContents).toContain('<32> Tj')
    expect(Number(firstPosition?.[1])).toBeGreaterThan(500)
    expect(Number(firstPosition?.[2])).toBe(18)
  })

  it('rejects pages whose halves cannot fit on Letter without scaling', async () => {
    const source = await PDFDocument.create()
    source.addPage([1800, 1500]).drawRectangle({ x: 0, y: 0, width: 10, height: 10 })

    await expect(convertPdf(await source.save())).rejects.toMatchObject<Partial<PdfCutterError>>({
      code: 'does-not-fit',
    })
  })
})
