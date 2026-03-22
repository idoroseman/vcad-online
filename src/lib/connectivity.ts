import { getComponentPinHoles, getPinIndexForPinNumber } from './footprints'
import type { BoardState, NetDef } from './types'

export interface RatsnestSegment {
  netName: string
  short?: boolean
  from: {
    row: number
    col: number
  }
  to: {
    row: number
    col: number
  }
}

export interface BoardConnectivity {
  groupFor: (row: number, col: number) => string
}

class UnionFind {
  private parent = new Map<string, string>()

  add(key: string) {
    if (!this.parent.has(key)) {
      this.parent.set(key, key)
    }
  }

  find(key: string): string {
    this.add(key)
    const parent = this.parent.get(key)

    if (!parent || parent === key) {
      return key
    }

    const root: string = this.find(parent)
    this.parent.set(key, root)
    return root
  }

  union(left: string, right: string) {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)

    if (leftRoot !== rightRoot) {
      this.parent.set(rightRoot, leftRoot)
    }
  }
}

function holeKey(row: number, col: number) {
  return `${row}:${col}`
}

function normalizeName(value: string) {
  return value.trim().toUpperCase()
}

function buildCutsByRow(board: BoardState) {
  const cutsByRow = new Map<number, Set<number>>()

  for (const cut of board.cuts) {
    const existing = cutsByRow.get(cut.row)

    if (existing) {
      existing.add(cut.col)
      continue
    }

    cutsByRow.set(cut.row, new Set([cut.col]))
  }

  return cutsByRow
}

export function buildBoardConnectivity(board: BoardState): BoardConnectivity {
  const unionFind = new UnionFind()
  const cutsByRow = buildCutsByRow(board)

  for (let row = 0; row < board.rows; row += 1) {
    for (let col = 0; col < board.cols; col += 1) {
      unionFind.add(holeKey(row, col))
    }
  }

  for (let row = 0; row < board.rows; row += 1) {
    const rowCuts = cutsByRow.get(row) ?? new Set<number>()

    for (let col = 0; col < board.cols - 1; col += 1) {
      if (rowCuts.has(col) || rowCuts.has(col + 1)) {
        continue
      }

      unionFind.union(holeKey(row, col), holeKey(row, col + 1))
    }
  }

  for (const link of board.links) {
    unionFind.union(holeKey(link.fromRow, link.fromCol), holeKey(link.toRow, link.toCol))
  }

  return {
    groupFor(row: number, col: number) {
      return unionFind.find(holeKey(row, col))
    },
  }
}

export function buildNetNamesByConnectivityGroup(board: BoardState) {
  const byGroup = new Map<string, Set<string>>()

  if (!board.netlist) {
    return byGroup
  }

  const connectivity = buildBoardConnectivity(board)
  const componentsByRefDes = new Map(board.components.map((component) => [normalizeName(component.refDes), component]))

  for (const net of board.netlist.nets) {
    const netName = net.name.trim()

    if (!netName) {
      continue
    }

    for (const node of net.nodes) {
      const component = componentsByRefDes.get(normalizeName(node.refDes))

      if (!component) {
        continue
      }

      const pinIndex = getPinIndexForPinNumber(component, node.pinNum)

      if (pinIndex === null) {
        continue
      }

      const hole = getComponentPinHoles(component)[pinIndex]

      if (!hole) {
        continue
      }

      const group = connectivity.groupFor(hole.row, hole.col)
      const existing = byGroup.get(group)

      if (existing) {
        existing.add(netName)
      } else {
        byGroup.set(group, new Set([netName]))
      }
    }
  }

  for (const wire of board.wires) {
    const netName = wire.signalName.trim()

    if (!netName) {
      continue
    }

    const group = connectivity.groupFor(wire.row, wire.col)
    const existing = byGroup.get(group)

    if (existing) {
      existing.add(netName)
    } else {
      byGroup.set(group, new Set([netName]))
    }
  }

  return byGroup
}

function resolveNetEndpoints(board: BoardState, net: NetDef) {
  const componentsByRefDes = new Map(board.components.map((component) => [normalizeName(component.refDes), component]))
  const endpoints: Array<{ row: number; col: number }> = []
  const seen = new Set<string>()

  for (const node of net.nodes) {
    const component = componentsByRefDes.get(normalizeName(node.refDes))

    if (!component) {
      continue
    }

    const pinIndex = getPinIndexForPinNumber(component, node.pinNum)

    if (pinIndex === null) {
      continue
    }

    const hole = getComponentPinHoles(component)[pinIndex]

    if (!hole) {
      continue
    }

    const key = holeKey(hole.row, hole.col)

    if (!seen.has(key)) {
      seen.add(key)
      endpoints.push(hole)
    }
  }

  for (const wire of board.wires) {
    if (normalizeName(wire.signalName) !== normalizeName(net.name)) {
      continue
    }

    const key = holeKey(wire.row, wire.col)

    if (!seen.has(key)) {
      seen.add(key)
      endpoints.push({ row: wire.row, col: wire.col })
    }
  }

  return endpoints
}

function distanceSquared(
  left: { row: number; col: number },
  right: { row: number; col: number },
) {
  const deltaRow = left.row - right.row
  const deltaCol = left.col - right.col

  return deltaRow * deltaRow + deltaCol * deltaCol
}

export function computeShortCircuits(board: BoardState): RatsnestSegment[] {
  if (!board.netlist) {
    return []
  }

  const connectivity = buildBoardConnectivity(board)
  const componentsByRefDes = new Map(board.components.map((component) => [normalizeName(component.refDes), component]))

  // group → Array<{ row, col, netName }>
  const pinsByGroup = new Map<string, Array<{ row: number; col: number; netName: string }>>()

  for (const net of board.netlist.nets) {
    const netName = net.name.trim()

    if (!netName) {
      continue
    }

    for (const node of net.nodes) {
      const component = componentsByRefDes.get(normalizeName(node.refDes))

      if (!component) {
        continue
      }

      const pinIndex = getPinIndexForPinNumber(component, node.pinNum)

      if (pinIndex === null) {
        continue
      }

      const hole = getComponentPinHoles(component)[pinIndex]

      if (!hole) {
        continue
      }

      const group = connectivity.groupFor(hole.row, hole.col)
      const existing = pinsByGroup.get(group)

      const entry = { row: hole.row, col: hole.col, netName }

      if (existing) {
        existing.push(entry)
      } else {
        pinsByGroup.set(group, [entry])
      }
    }
  }

  const segments: RatsnestSegment[] = []

  for (const pins of pinsByGroup.values()) {
    // Find distinct nets in this group
    const nets = new Set(pins.map((pin) => pin.netName))

    if (nets.size < 2) {
      continue
    }

    // Build a minimal spanning tree over all shorted pins
    const placed = [pins[0]]
    const remaining = pins.slice(1)

    while (remaining.length > 0) {
      let bestScore = Number.POSITIVE_INFINITY
      let bestFrom = placed[0]
      let bestToIndex = 0

      for (const from of placed) {
        for (let index = 0; index < remaining.length; index += 1) {
          const to = remaining[index]

          if (to === undefined) {
            continue
          }

          const score = distanceSquared(from, to)

          if (score < bestScore) {
            bestScore = score
            bestFrom = from
            bestToIndex = index
          }
        }
      }

      const bestTo = remaining[bestToIndex]

      if (!bestTo) {
        break
      }

      segments.push({
        netName: `${bestFrom.netName}/${bestTo.netName}`,
        short: true,
        from: { row: bestFrom.row, col: bestFrom.col },
        to: { row: bestTo.row, col: bestTo.col },
      })

      placed.push(bestTo)
      remaining.splice(bestToIndex, 1)
    }
  }

  return segments
}

export function computeRatsnest(board: BoardState): RatsnestSegment[] {
  if (!board.netlist) {
    return []
  }

  const connectivity = buildBoardConnectivity(board)
  const segments: RatsnestSegment[] = []

  for (const net of board.netlist.nets) {
    const endpoints = resolveNetEndpoints(board, net)

    if (endpoints.length < 2) {
      continue
    }

    const groups = new Map<string, Array<{ row: number; col: number }>>()

    for (const endpoint of endpoints) {
      const group = connectivity.groupFor(endpoint.row, endpoint.col)
      const existing = groups.get(group)

      if (existing) {
        existing.push(endpoint)
      } else {
        groups.set(group, [endpoint])
      }
    }

    const groupEntries = [...groups.entries()]

    if (groupEntries.length < 2) {
      continue
    }

    const connected = new Set<string>([groupEntries[0][0]])

    while (connected.size < groupEntries.length) {
      let best:
        | {
            from: { row: number; col: number }
            to: { row: number; col: number }
            nextGroup: string
            score: number
          }
        | null = null

      for (const [connectedGroup, connectedEndpoints] of groupEntries) {
        if (!connected.has(connectedGroup)) {
          continue
        }

        for (const [candidateGroup, candidateEndpoints] of groupEntries) {
          if (connected.has(candidateGroup)) {
            continue
          }

          for (const from of connectedEndpoints) {
            for (const to of candidateEndpoints) {
              const score = distanceSquared(from, to)

              if (!best || score < best.score) {
                best = {
                  from,
                  to,
                  nextGroup: candidateGroup,
                  score,
                }
              }
            }
          }
        }
      }

      if (!best) {
        break
      }

      segments.push({
        netName: net.name,
        from: best.from,
        to: best.to,
      })
      connected.add(best.nextGroup)
    }
  }

  return segments
}