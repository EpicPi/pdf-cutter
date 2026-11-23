export const POINTS_PER_INCH = 72
export const LETTER_PORTRAIT = {
  width: POINTS_PER_INCH * 8.5,
  height: POINTS_PER_INCH * 11,
} as const
export const LETTER_LANDSCAPE = {
  width: LETTER_PORTRAIT.height,
  height: LETTER_PORTRAIT.width,
} as const

export type QuarterTurn = 0 | 90 | 180 | 270
export type DisplayHalf = 'top' | 'bottom' | 'left' | 'right'

export interface PageBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ClipBox {
  left: number
  bottom: number
  right: number
  top: number
}

export interface DisplayedPageGeometry {
  width: number
  height: number
  rotation: QuarterTurn
}

export interface DrawPlacement {
  x: number
  y: number
  rotation: QuarterTurn
  width: number
  height: number
  marginX: number
  marginY: number
  pageWidth: number
  pageHeight: number
}

export function normalizeRotation(angle: number): QuarterTurn {
  const normalized = ((angle % 360) + 360) % 360

  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized
  }

  throw new Error(`Unsupported page rotation: ${angle}°`)
}

export function getDisplayedPageGeometry(
  box: PageBox,
  rotationAngle: number,
): DisplayedPageGeometry {
  const rotation = normalizeRotation(rotationAngle)
  const swapsAxes = rotation === 90 || rotation === 270

  return {
    width: swapsAxes ? box.height : box.width,
    height: swapsAxes ? box.width : box.height,
    rotation,
  }
}

export function intersectPageBoxes(first: PageBox, second: PageBox): PageBox {
  const left = Math.max(first.x, second.x)
  const bottom = Math.max(first.y, second.y)
  const right = Math.min(first.x + first.width, second.x + second.width)
  const top = Math.min(first.y + first.height, second.y + second.height)

  if (right <= left || top <= bottom) {
    throw new Error('The page CropBox does not overlap its MediaBox.')
  }

  return { x: left, y: bottom, width: right - left, height: top - bottom }
}

export function getLongAxisHalfOrder(
  box: PageBox,
  rotationAngle: number,
): readonly [DisplayHalf, DisplayHalf] {
  const displayed = getDisplayedPageGeometry(box, rotationAngle)
  return displayed.height >= displayed.width ? ['top', 'bottom'] : ['left', 'right']
}

export function getDisplayHalfClipBox(
  box: PageBox,
  rotationAngle: number,
  half: DisplayHalf,
): ClipBox {
  const rotation = normalizeRotation(rotationAngle)
  const midpointX = box.x + box.width / 2
  const midpointY = box.y + box.height / 2
  const right = box.x + box.width
  const top = box.y + box.height

  const leftRaw = { left: box.x, bottom: box.y, right: midpointX, top }
  const rightRaw = { left: midpointX, bottom: box.y, right, top }
  const bottomRaw = { left: box.x, bottom: box.y, right, top: midpointY }
  const topRaw = { left: box.x, bottom: midpointY, right, top }

  switch (rotation) {
    case 0:
      return { top: topRaw, bottom: bottomRaw, left: leftRaw, right: rightRaw }[half]
    case 90:
      return { top: leftRaw, bottom: rightRaw, left: bottomRaw, right: topRaw }[half]
    case 180:
      return { top: bottomRaw, bottom: topRaw, left: rightRaw, right: leftRaw }[half]
    case 270:
      return { top: rightRaw, bottom: leftRaw, left: topRaw, right: bottomRaw }[half]
  }
}

export function getOutputRotation(sourceRotationAngle: number): QuarterTurn {
  const sourceRotation = normalizeRotation(sourceRotationAngle)
  return normalizeRotation(-(sourceRotation + 90))
}

function selectLetterSize(width: number, height: number): {
  pageWidth: number
  pageHeight: number
} {
  const preferred =
    width > height
      ? [LETTER_LANDSCAPE, LETTER_PORTRAIT]
      : [LETTER_PORTRAIT, LETTER_LANDSCAPE]
  const page = preferred.find(
    (candidate) => width <= candidate.width + 0.01 && height <= candidate.height + 0.01,
  )

  if (!page) {
    throw new Error(
      'The rotated page half does not fit on a portrait or landscape US Letter page at 1:1 scale.',
    )
  }

  return { pageWidth: page.width, pageHeight: page.height }
}

export function getCenteredPlacement(
  embeddedWidth: number,
  embeddedHeight: number,
  rotationAngle: number,
): DrawPlacement {
  const rotation = normalizeRotation(rotationAngle)
  const swapsAxes = rotation === 90 || rotation === 270
  const width = swapsAxes ? embeddedHeight : embeddedWidth
  const height = swapsAxes ? embeddedWidth : embeddedHeight
  const { pageWidth, pageHeight } = selectLetterSize(width, height)
  const marginX = (pageWidth - width) / 2
  const marginY = (pageHeight - height) / 2

  const shared = { rotation, width, height, marginX, marginY, pageWidth, pageHeight }

  switch (rotation) {
    case 0:
      return { x: marginX, y: marginY, ...shared }
    case 90:
      return { x: marginX + embeddedHeight, y: marginY, ...shared }
    case 180:
      return {
        x: marginX + embeddedWidth,
        y: marginY + embeddedHeight,
        ...shared,
      }
    case 270:
      return { x: marginX, y: marginY + embeddedWidth, ...shared }
  }
}
