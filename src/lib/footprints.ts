import type { PlacedComponent } from './types'

export const STRIPBOARD_HOLE_PITCH_MM = 2.54

export interface FootprintPin {
  row: number
  col: number
}

export interface FootprintDefinition {
  id: string
  label: string
  style: 'axial' | 'radial' | 'dip'
  prefix: string
  defaultValue: string
  pins: FootprintPin[]
  defaultLeadPitch?: number
  minLeadPitch?: number
  maxLeadPitch?: number
  defaultBodyRadius?: number
  minBodyRadius?: number
  maxBodyRadius?: number
  defaultDipPins?: number
  minDipPins?: number
  maxDipPins?: number
  defaultDipWidth?: number
  minDipWidth?: number
  maxDipWidth?: number
}

export const footprintCatalog: FootprintDefinition[] = [
  {
    id: 'resistor-axial-7',
    label: 'Axial Resistor',
    style: 'axial',
    prefix: 'R',
    defaultValue: '10k',
    pins: [],
    defaultLeadPitch: 6,
    minLeadPitch: 3,
    maxLeadPitch: 24,
  },
  {
    id: 'capacitor-radial-3',
    label: 'Radial Capacitor',
    style: 'radial',
    prefix: 'C',
    defaultValue: '100n',
    pins: [],
    defaultLeadPitch: 2,
    minLeadPitch: 1,
    maxLeadPitch: 12,
    defaultBodyRadius: 1.2,
    minBodyRadius: 0.75,
    maxBodyRadius: 25,
  },
  {
    id: 'dip-8',
    label: 'DIP IC',
    style: 'dip',
    prefix: 'U',
    defaultValue: 'LM358',
    pins: [],
    defaultDipPins: 8,
    minDipPins: 4,
    maxDipPins: 40,
    defaultDipWidth: 3,
    minDipWidth: 2,
    maxDipWidth: 12,
  },
]

export const footprintMap = new Map(footprintCatalog.map((footprint) => [footprint.id, footprint]))

export function getFootprint(footprintId: string) {
  return footprintMap.get(footprintId) ?? footprintCatalog[0]
}

export function getLeadPitch(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style === 'dip') {
    return null
  }

  const minLeadPitch = footprint.minLeadPitch ?? (footprint.style === 'radial' ? 1 : 3)
  const maxLeadPitch = footprint.maxLeadPitch ?? 24
  const defaultLeadPitch = footprint.defaultLeadPitch ?? (footprint.style === 'radial' ? 2 : 6)

  return Math.max(minLeadPitch, Math.min(maxLeadPitch, Math.round(component.leadPitch ?? defaultLeadPitch)))
}

export function getBodyRadius(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style !== 'radial') {
    return null
  }

  const minBodyRadius = footprint.minBodyRadius ?? 0.75
  const maxBodyRadius = footprint.maxBodyRadius ?? 25
  const defaultBodyRadius = footprint.defaultBodyRadius ?? 1.2

  return Math.max(minBodyRadius, Math.min(maxBodyRadius, component.bodyRadius ?? defaultBodyRadius))
}

export function getDipPinCount(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style !== 'dip') {
    return null
  }

  const minDipPins = footprint.minDipPins ?? 4
  const maxDipPins = footprint.maxDipPins ?? 40
  const defaultDipPins = footprint.defaultDipPins ?? 8
  const rawPins = Math.round(component.dipPins ?? defaultDipPins)
  const evenPins = rawPins % 2 === 0 ? rawPins : rawPins + 1

  return Math.max(minDipPins, Math.min(maxDipPins, evenPins))
}

export function getDipWidth(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style !== 'dip') {
    return null
  }

  const minDipWidth = footprint.minDipWidth ?? 2
  const maxDipWidth = footprint.maxDipWidth ?? 12
  const defaultDipWidth = footprint.defaultDipWidth ?? 3

  return Math.max(minDipWidth, Math.min(maxDipWidth, Math.round(component.dipWidth ?? defaultDipWidth)))
}

export function rotateOffset(row: number, col: number, rotation: PlacedComponent['rotation']) {
  switch (rotation) {
    case 1:
      return { row: col, col: -row }
    case 2:
      return { row: -row, col: -col }
    case 3:
      return { row: -col, col: row }
    default:
      return { row, col }
  }
}

export function getComponentPinHoles(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)
  const pins =
    footprint.style === 'axial'
      ? [
          { row: 0, col: 0 },
          { row: 0, col: getLeadPitch(component) ?? footprint.defaultLeadPitch ?? 6 },
        ]
      : footprint.style === 'radial'
        ? [
            { row: 0, col: 0 },
            { row: getLeadPitch(component) ?? footprint.defaultLeadPitch ?? 1, col: 0 },
          ]
      : footprint.style === 'dip'
        ? getDipPins(component)
      : footprint.pins

  return pins.map((pin) => {
    const rotated = rotateOffset(pin.row, pin.col, component.rotation)

    return {
      row: component.row + rotated.row,
      col: component.col + rotated.col,
    }
  })
}

export function getDipPins(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style !== 'dip') {
    return footprint.pins
  }

  const pinCount = getDipPinCount(component) ?? footprint.defaultDipPins ?? 8
  const width = getDipWidth(component) ?? footprint.defaultDipWidth ?? 3
  const pinsPerSide = pinCount / 2
  const leftPins = Array.from({ length: pinsPerSide }, (_, index) => ({ row: index, col: 0 }))
  const rightPins = Array.from({ length: pinsPerSide }, (_, index) => ({ row: pinsPerSide - 1 - index, col: width }))

  return [...leftPins, ...rightPins]
}

export function getComponentPinNumber(component: PlacedComponent, index: number) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style === 'dip') {
    const pinCount = getDipPinCount(component) ?? footprint.defaultDipPins ?? 8

    if (index < 0 || index >= pinCount) {
      return null
    }

    return String(index + 1)
  }

  if (footprint.style === 'axial' || footprint.style === 'radial') {
    if (index < 0 || index > 1) {
      return null
    }

    return String(index + 1)
  }

  return null
}

export function getPinIndexForPinNumber(component: PlacedComponent, pinNumber: string) {
  const normalizedPin = pinNumber.trim()

  if (!normalizedPin) {
    return null
  }

  const pinTotal = getComponentPinHoles(component).length

  for (let index = 0; index < pinTotal; index += 1) {
    if (getComponentPinNumber(component, index) === normalizedPin || String(index + 1) === normalizedPin) {
      return index
    }
  }

  const parsedPin = Number.parseInt(normalizedPin, 10)

  if (Number.isNaN(parsedPin)) {
    return null
  }

  return parsedPin >= 1 && parsedPin <= pinTotal ? parsedPin - 1 : null
}

export function getComponentBounds(component: PlacedComponent) {
  const pins = getComponentPinHoles(component)
  const axialBody = getAxialBodyGeometry(component)
  const radialBody = getRadialBodyGeometry(component)
  const points = axialBody ? [...pins, axialBody.bodyStart, axialBody.bodyEnd] : pins
  const rows = points.map((pin) => pin.row)
  const cols = points.map((pin) => pin.col)

  if (radialBody) {
    rows.push(radialBody.center.row - radialBody.radiusBoard, radialBody.center.row + radialBody.radiusBoard)
    cols.push(radialBody.center.col - radialBody.radiusBoard, radialBody.center.col + radialBody.radiusBoard)
  }

  return {
    minRow: Math.min(...rows),
    maxRow: Math.max(...rows),
    minCol: Math.min(...cols),
    maxCol: Math.max(...cols),
  }
}

export function getAxialBodyGeometry(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style !== 'axial') {
    return null
  }

  const leadPitch = getLeadPitch(component) ?? footprint.defaultLeadPitch ?? 6
  const bodyStart = rotateOffset(0, (leadPitch - 3) / 2, component.rotation)
  const bodyEnd = rotateOffset(0, (leadPitch + 3) / 2, component.rotation)

  return {
    bodyStart: {
      row: component.row + bodyStart.row,
      col: component.col + bodyStart.col,
    },
    bodyEnd: {
      row: component.row + bodyEnd.row,
      col: component.col + bodyEnd.col,
    },
  }
}

export function getRadialBodyGeometry(component: PlacedComponent) {
  const footprint = getFootprint(component.footprintId)

  if (footprint.style !== 'radial') {
    return null
  }

  const [firstPin, secondPin] = getComponentPinHoles(component)
  const radiusMm = getBodyRadius(component) ?? footprint.defaultBodyRadius ?? 1.2
  const radiusBoard = radiusMm / STRIPBOARD_HOLE_PITCH_MM
  const midpoint = {
    row: (firstPin.row + secondPin.row) / 2,
    col: (firstPin.col + secondPin.col) / 2,
  }
  const deltaRow = secondPin.row - firstPin.row
  const deltaCol = secondPin.col - firstPin.col
  const pinDistanceBoard = Math.hypot(deltaRow, deltaCol) || 1
  const tangent = {
    row: deltaRow / pinDistanceBoard,
    col: deltaCol / pinDistanceBoard,
  }
  const desiredHalfLeadSpan = pinDistanceBoard / 2
  const maxHalfLeadSpanInsideBody = Math.max(radiusBoard - 0.22, 0.18)
  const halfLeadSpan = Math.min(desiredHalfLeadSpan, maxHalfLeadSpanInsideBody)

  return {
    center: midpoint,
    radiusMm,
    radiusBoard,
    leadEntries: [
      {
        row: midpoint.row - tangent.row * halfLeadSpan,
        col: midpoint.col - tangent.col * halfLeadSpan,
      },
      {
        row: midpoint.row + tangent.row * halfLeadSpan,
        col: midpoint.col + tangent.col * halfLeadSpan,
      },
    ],
  }
}
