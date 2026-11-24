import { expect, test } from '@playwright/test'
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, rgb } from 'pdf-lib'

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

test('uploads, converts, and downloads a supported PDF entirely in the browser', async ({ page }) => {
  const source = await PDFDocument.create()
  const sourcePage = source.addPage([595.2756, 841.8898])
  sourcePage.drawRectangle({ x: 80, y: 620, width: 180, height: 80, color: rgb(0.1, 0.6, 0.4) })
  sourcePage.drawRectangle({ x: 320, y: 120, width: 180, height: 80, color: rgb(0.9, 0.3, 0.2) })

  await page.goto('/')
  await expect(page.getByText('A tiny tool for a precise print job')).toHaveCount(0)
  await page.locator('#file-input').setInputFiles({
    name: 'calibration.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await source.save()),
  })

  await expect(page.getByRole('heading', { name: 'Ready to split and center' })).toBeVisible()
  await expect(page.getByText('2 Letter pages')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Corner' })).toBeChecked()
  await page.getByRole('radio', { name: 'Center' }).check()
  await expect(page.getByRole('radio', { name: 'Center' })).toBeChecked()
  await page.getByRole('button', { name: 'Prepare PDF' }).click()
  await expect(page.getByRole('heading', { name: 'Your US Letter-size PDF is ready' })).toBeVisible()
  await expect(page.locator('.state-panel-success .action-row > *')).toHaveText([
    'Start Over',
    'Download PDF',
  ])

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Download PDF' }).click()
  const download = await downloadPromise
  const path = await download.path()

  expect(download.suggestedFilename()).toBe('calibration-half-letter.pdf')
  expect(path).not.toBeNull()

  const output = await PDFDocument.load(await download.createReadStream().then(async (stream) => {
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks)
  }))
  expect(output.getPageCount()).toBe(2)
  const firstPageContents = getDecodedPageContents(output, 0)
  const number = '-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)'
  const centeredLabelMatrix = firstPageContents.match(
    new RegExp(
      `(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s+Tm\\s+<3141>\\s+Tj`,
    ),
  )

  expect(centeredLabelMatrix).not.toBeNull()
  expect(Number(centeredLabelMatrix?.[1])).toBeCloseTo(0, 10)
  expect(Number(centeredLabelMatrix?.[2])).toBeCloseTo(-1, 10)
  expect(Number(centeredLabelMatrix?.[3])).toBeCloseTo(1, 10)
  expect(Number(centeredLabelMatrix?.[4])).toBeCloseTo(0, 10)
  expect(Number(centeredLabelMatrix?.[5])).toBeGreaterThan(250)
  expect(Number(centeredLabelMatrix?.[5])).toBeLessThan(350)
  expect(Number(centeredLabelMatrix?.[6])).toBeGreaterThan(350)
  expect(Number(centeredLabelMatrix?.[6])).toBeLessThan(450)
})
