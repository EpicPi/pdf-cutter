import { describe, expect, it } from 'vitest'

import {
  LETTER_LANDSCAPE,
  LETTER_PORTRAIT,
  getCenteredPlacement,
  getDisplayHalfClipBox,
  getLongAxisHalfOrder,
  getOutputRotation,
} from '../../src/pdf/geometry'

describe('long-axis page geometry', () => {
  it('rotates an unrotated source page 90 degrees clockwise in the output', () => {
    expect(getOutputRotation(0)).toBe(270)
  })

  it('cuts portrait A4 top-to-bottom and centers the rotated half on portrait Letter', () => {
    const a4 = { x: 0, y: 0, width: 595.2756, height: 841.8898 }

    expect(getLongAxisHalfOrder(a4, 0)).toEqual(['top', 'bottom'])
    expect(getDisplayHalfClipBox(a4, 0, 'top')).toEqual({
      left: 0,
      bottom: 420.9449,
      right: 595.2756,
      top: 841.8898,
    })

    const placement = getCenteredPlacement(
      a4.width,
      a4.height / 2,
      getOutputRotation(0),
    )

    expect(placement.pageWidth).toBe(LETTER_PORTRAIT.width)
    expect(placement.pageHeight).toBe(LETTER_PORTRAIT.height)
    expect(placement.width).toBeCloseTo(420.9449, 4)
    expect(placement.height).toBeCloseTo(595.2756, 4)
    expect(placement.marginX).toBeCloseTo(95.52755, 4)
    expect(placement.marginY).toBeCloseTo(98.3622, 4)
  })

  it('cuts the custom landscape sample left-to-right and uses landscape Letter', () => {
    const custom = { x: 0, y: 0, width: 828, height: 648 }

    expect(getLongAxisHalfOrder(custom, 0)).toEqual(['left', 'right'])
    expect(getDisplayHalfClipBox(custom, 0, 'left')).toEqual({
      left: 0,
      bottom: 0,
      right: 414,
      top: 648,
    })

    const placement = getCenteredPlacement(414, 648, getOutputRotation(0))

    expect(placement.pageWidth).toBe(LETTER_LANDSCAPE.width)
    expect(placement.pageHeight).toBe(LETTER_LANDSCAPE.height)
    expect(placement.width).toBe(648)
    expect(placement.height).toBe(414)
    expect(placement.marginX).toBe(72)
    expect(placement.marginY).toBe(99)
  })

  it('interprets top, bottom, left, and right after page rotation metadata', () => {
    const rawLandscape = { x: 10, y: 20, width: 842, height: 595 }

    expect(getLongAxisHalfOrder(rawLandscape, 90)).toEqual(['top', 'bottom'])
    expect(getDisplayHalfClipBox(rawLandscape, 90, 'top')).toEqual({
      left: 10,
      bottom: 20,
      right: 431,
      top: 615,
    })
    expect(getDisplayHalfClipBox(rawLandscape, 90, 'bottom')).toEqual({
      left: 431,
      bottom: 20,
      right: 852,
      top: 615,
    })
  })

  it('rejects a half that cannot fit either Letter orientation at 1:1 scale', () => {
    expect(() => getCenteredPlacement(900, 700, 0)).toThrow(/does not fit/)
  })
})
