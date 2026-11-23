import { expect, test } from '@playwright/test'
import { PDFDocument, rgb } from 'pdf-lib'

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
})
