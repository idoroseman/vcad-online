import type { NetDef, Netlist, NetlistComponent, NetNode } from './types'

function readText(element: Element | null | undefined) {
  return element?.textContent?.trim() ?? ''
}

type Sexpr = string | Sexpr[]

function requireBrowserParser() {
  if (typeof DOMParser === 'undefined') {
    throw new Error('KiCad netlist import requires a browser environment.')
  }

  return new DOMParser()
}

function tokenizeSexpr(source: string) {
  const tokens: string[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]

    if (!char) {
      break
    }

    if (char === ';' || char === '#') {
      while (index < source.length && source[index] !== '\n') {
        index += 1
      }
      continue
    }

    if (/\s/.test(char)) {
      index += 1
      continue
    }

    if (char === '(' || char === ')') {
      tokens.push(char)
      index += 1
      continue
    }

    if (char === '"') {
      index += 1
      let value = ''

      while (index < source.length) {
        const next = source[index]

        if (!next) {
          break
        }

        if (next === '\\' && index + 1 < source.length) {
          value += source[index + 1]
          index += 2
          continue
        }

        if (next === '"') {
          index += 1
          break
        }

        value += next
        index += 1
      }

      tokens.push(value)
      continue
    }

    let value = ''

    while (index < source.length) {
      const next = source[index]

      if (!next || /\s/.test(next) || next === '(' || next === ')' || next === ';') {
        break
      }

      value += next
      index += 1
    }

    if (value.length > 0) {
      tokens.push(value)
    }
  }

  return tokens
}

function parseSexprTokens(tokens: string[]) {
  let index = 0

  function parseValue(): Sexpr {
    const token = tokens[index]

    if (token === undefined) {
      throw new Error('Unexpected end of KiCad netlist.')
    }

    if (token === '(') {
      index += 1
      const list: Sexpr[] = []

      while (index < tokens.length && tokens[index] !== ')') {
        list.push(parseValue())
      }

      if (tokens[index] !== ')') {
        throw new Error('Unbalanced parentheses in KiCad netlist.')
      }

      index += 1
      return list
    }

    if (token === ')') {
      throw new Error('Unexpected closing parenthesis in KiCad netlist.')
    }

    index += 1
    return token
  }

  const values: Sexpr[] = []

  while (index < tokens.length) {
    values.push(parseValue())
  }

  return values
}

function asList(value: Sexpr | undefined): Sexpr[] | null {
  return Array.isArray(value) ? value : null
}

function head(list: Sexpr[] | null) {
  return list && typeof list[0] === 'string' ? list[0] : null
}

function childrenByHead(list: Sexpr[] | null, name: string) {
  if (!list) {
    return []
  }

  return list.filter((child): child is Sexpr[] => Array.isArray(child) && head(child) === name)
}

function fieldValue(list: Sexpr[] | null, name: string) {
  const field = childrenByHead(list, name)[0]

  if (!field) {
    return ''
  }

  const value = field[1]
  return typeof value === 'string' ? value.trim() : ''
}

function propertyValue(list: Sexpr[] | null, propertyName: string) {
  const property = childrenByHead(list, 'property').find(
    (entry) => typeof entry[1] === 'string' && entry[1].trim() === propertyName,
  )

  if (!property) {
    return ''
  }

  const value = property[2]
  return typeof value === 'string' ? value.trim() : ''
}

function decodeSexprAtom(value: string) {
  const trimmed = value.trim()

  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\(.)/g, '$1')
  }

  return trimmed
}

function readLooseField(block: string, field: string) {
  const pattern = new RegExp(`\\(${field}\\s+("(?:\\\\.|[^"])*"|[^()\\s]+)`, 'i')
  const match = block.match(pattern)

  if (!match || !match[1]) {
    return ''
  }

  return decodeSexprAtom(match[1])
}

function readLooseProperty(block: string, propertyName: string) {
  const escaped = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\(property\\s+"${escaped}"\\s+("(?:\\\\.|[^"])*"|[^()\\s]+)`, 'i')
  const match = block.match(pattern)

  if (!match || !match[1]) {
    return ''
  }

  return decodeSexprAtom(match[1])
}

function extractSexprBlocks(source: string, keyword: string) {
  const blocks: string[] = []
  let searchIndex = 0
  const needle = `(${keyword}`

  while (searchIndex < source.length) {
    const start = source.indexOf(needle, searchIndex)

    if (start === -1) {
      break
    }

    let index = start
    let depth = 0
    let inString = false
    let escaped = false

    while (index < source.length) {
      const char = source[index]

      if (!char) {
        break
      }

      if (inString) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }

        index += 1
        continue
      }

      if (char === '"') {
        inString = true
        index += 1
        continue
      }

      if (char === '(') {
        depth += 1
      } else if (char === ')') {
        depth -= 1

        if (depth === 0) {
          index += 1
          break
        }
      }

      index += 1
    }

    if (index > start) {
      blocks.push(source.slice(start, index))
    }

    searchIndex = Math.max(index, start + needle.length)
  }

  return blocks
}

function parseKiCadNetlistSexprLoose(source: string): Netlist {
  const components = extractSexprBlocks(source, 'comp')
    .map<NetlistComponent>((block) => ({
      refDes: readLooseField(block, 'ref'),
      value: readLooseField(block, 'value'),
      footprintHint: readLooseField(block, 'footprint') || undefined,
    }))
    .filter((component) => component.refDes.length > 0)

  const nets = extractSexprBlocks(source, 'net')
    .map<NetDef>((netBlock) => ({
      name: readLooseField(netBlock, 'name'),
      nodes: extractSexprBlocks(netBlock, 'node')
        .map<NetNode>((nodeBlock) => ({
          refDes: readLooseField(nodeBlock, 'ref'),
          pinNum: readLooseField(nodeBlock, 'pin'),
        }))
        .filter((node) => node.refDes.length > 0 && node.pinNum.length > 0),
    }))
    .filter((net) => net.name.length > 0 && net.nodes.length > 0)

  if (components.length === 0 && nets.length === 0) {
    throw new Error('No components or nets were found in the KiCad netlist.')
  }

  return {
    components,
    nets,
  }
}

function parseComponents(root: Element) {
  const components = [...root.querySelectorAll('components > comp')]

  return components.map<NetlistComponent>((component) => ({
    refDes: component.getAttribute('ref')?.trim() ?? '',
    value: readText(component.querySelector('value')),
    footprintHint: readText(component.querySelector('footprint')) || undefined,
  }))
}

function parseNetNodes(netElement: Element) {
  return [...netElement.querySelectorAll('node')]
    .map<NetNode>((node) => ({
      refDes: node.getAttribute('ref')?.trim() ?? '',
      pinNum: node.getAttribute('pin')?.trim() ?? '',
    }))
    .filter((node) => node.refDes.length > 0 && node.pinNum.length > 0)
}

function parseNets(root: Element) {
  const nets = [...root.querySelectorAll('nets > net')]

  return nets
    .map<NetDef>((net) => ({
      name: net.getAttribute('name')?.trim() ?? '',
      nodes: parseNetNodes(net),
    }))
    .filter((net) => net.name.length > 0 && net.nodes.length > 0)
}

export function parseKiCadNetlistXml(source: string): Netlist {
  const parser = requireBrowserParser()
  const document = parser.parseFromString(source, 'application/xml')
  const parseError = document.querySelector('parsererror')

  if (parseError) {
    throw new Error('The selected file is not valid XML.')
  }

  const exportRoot = document.querySelector('export')

  if (!exportRoot) {
    throw new Error('Unsupported KiCad netlist format. Expected an exported XML netlist.')
  }

  const components = parseComponents(exportRoot).filter((component) => component.refDes.length > 0)
  const nets = parseNets(exportRoot)

  if (components.length === 0 && nets.length === 0) {
    throw new Error('No components or nets were found in the KiCad netlist.')
  }

  return {
    components,
    nets,
  }
}

export function parseKiCadNetlistSexpr(source: string): Netlist {
  const tokens = tokenizeSexpr(source)

  if (tokens.length === 0) {
    throw new Error('The selected file is empty.')
  }

  try {
    const forms = parseSexprTokens(tokens)
    const exportForm = forms.find((form) => Array.isArray(form) && head(form) === 'export')
    const exportList = asList(exportForm)

    if (!exportList) {
      return parseKiCadNetlistSexprLoose(source)
    }

    const componentsForm = childrenByHead(exportList, 'components')[0]
    const netsForm = childrenByHead(exportList, 'nets')[0]
    const componentForms = childrenByHead(componentsForm, 'comp')
    const netForms = childrenByHead(netsForm, 'net')

    const components = componentForms
      .map<NetlistComponent>((component) => ({
        refDes: fieldValue(component, 'ref'),
        value: fieldValue(component, 'value'),
        footprintHint: fieldValue(component, 'footprint') || undefined,
      }))
      .filter((component) => component.refDes.length > 0)

    const nets = netForms
      .map<NetDef>((net) => ({
        name: fieldValue(net, 'name'),
        nodes: childrenByHead(net, 'node')
          .map<NetNode>((node) => ({
            refDes: fieldValue(node, 'ref'),
            pinNum: fieldValue(node, 'pin'),
          }))
          .filter((node) => node.refDes.length > 0 && node.pinNum.length > 0),
      }))
      .filter((net) => net.name.length > 0 && net.nodes.length > 0)

    if (components.length === 0 && nets.length === 0) {
      return parseKiCadNetlistSexprLoose(source)
    }

    return {
      components,
      nets,
    }
  } catch {
    return parseKiCadNetlistSexprLoose(source)
  }
}

function parseKiCadSchematicSexprLoose(source: string): Netlist {
  const components = extractSexprBlocks(source, 'symbol')
    .map<NetlistComponent>((block) => ({
      refDes: readLooseProperty(block, 'Reference'),
      value: readLooseProperty(block, 'Value'),
      footprintHint: readLooseProperty(block, 'Footprint') || undefined,
    }))
    .filter((component) => component.refDes.length > 0 && !component.refDes.startsWith('#'))

  if (components.length === 0) {
    throw new Error('No components were found in the KiCad schematic file.')
  }

  return {
    components,
    nets: [],
  }
}

interface SchematicPinTemplate {
  pinNum: string
  x: number
  y: number
  unit: number | null
}

interface SchematicNamedPoint {
  name: string
  x: number
  y: number
}

function parseNumberAtom(value: Sexpr | undefined, fallback = 0) {
  if (typeof value !== 'string') {
    return fallback
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseIntAtom(value: Sexpr | undefined, fallback = 0) {
  if (typeof value !== 'string') {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function pointKey(x: number, y: number) {
  return `${x.toFixed(4)}:${y.toFixed(4)}`
}

function pointEquals(x1: number, y1: number, x2: number, y2: number, tolerance = 0.001) {
  return Math.abs(x1 - x2) <= tolerance && Math.abs(y1 - y2) <= tolerance
}

function pointOnSegment(
  pointX: number,
  pointY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tolerance = 0.001,
) {
  const cross = (pointX - x1) * (y2 - y1) - (pointY - y1) * (x2 - x1)

  if (Math.abs(cross) > tolerance) {
    return false
  }

  const minX = Math.min(x1, x2) - tolerance
  const maxX = Math.max(x1, x2) + tolerance
  const minY = Math.min(y1, y2) - tolerance
  const maxY = Math.max(y1, y2) + tolerance

  return pointX >= minX && pointX <= maxX && pointY >= minY && pointY <= maxY
}

function pinTemplateUnit(symbolName: string) {
  const match = symbolName.match(/_(\d+)_\d+$/)

  if (!match || !match[1]) {
    return null
  }

  return Number.parseInt(match[1], 10)
}

function collectPinTemplates(symbolList: Sexpr[] | null, inheritedUnit: number | null = null): SchematicPinTemplate[] {
  if (!symbolList) {
    return []
  }

  const symbolName = typeof symbolList[1] === 'string' ? symbolList[1] : ''
  const currentUnit = pinTemplateUnit(symbolName) ?? inheritedUnit
  const templates: SchematicPinTemplate[] = []

  for (const pin of childrenByHead(symbolList, 'pin')) {
    const at = childrenByHead(pin, 'at')[0]
    const number = fieldValue(pin, 'number')

    if (!at || !number) {
      continue
    }

    templates.push({
      pinNum: number,
      x: parseNumberAtom(at[1], 0),
      y: parseNumberAtom(at[2], 0),
      unit: currentUnit,
    })
  }

  for (const child of childrenByHead(symbolList, 'symbol')) {
    templates.push(...collectPinTemplates(child, currentUnit))
  }

  return templates
}

function buildLibraryPinTemplates(root: Sexpr[]) {
  const byLibId = new Map<string, SchematicPinTemplate[]>()
  const library = childrenByHead(root, 'lib_symbols')[0]

  if (!library) {
    return byLibId
  }

  for (const symbol of childrenByHead(library, 'symbol')) {
    const libId = typeof symbol[1] === 'string' ? symbol[1] : ''

    if (!libId) {
      continue
    }

    const templates = collectPinTemplates(symbol)

    if (templates.length > 0) {
      byLibId.set(libId, templates)
    }
  }

  return byLibId
}

function rotatePoint(x: number, y: number, rotation: number) {
  const normalized = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360

  switch (normalized) {
    case 90:
      return { x: -y, y: x }
    case 180:
      return { x: -x, y: -y }
    case 270:
      return { x: y, y: -x }
    default:
      return { x, y }
  }
}

function mirrorPoint(x: number, y: number, mirror: string) {
  if (mirror === 'x') {
    return { x, y: -y }
  }

  if (mirror === 'y') {
    return { x: -x, y }
  }

  return { x, y }
}

function symbolTransformPoint(x: number, y: number, rotation: number, mirror: string) {
  const mirrored = mirrorPoint(x, y, mirror)
  return rotatePoint(mirrored.x, mirrored.y, rotation)
}

function symbolPinPoints(symbol: Sexpr[], pinTemplatesByLibId: Map<string, SchematicPinTemplate[]>) {
  const libId = fieldValue(symbol, 'lib_id')
  const at = childrenByHead(symbol, 'at')[0]

  if (!libId || !at) {
    return [] as Array<{ pinNum: string; x: number; y: number }>
  }

  const templates = pinTemplatesByLibId.get(libId) ?? []
  const unit = parseIntAtom(childrenByHead(symbol, 'unit')[0]?.[1], 1)
  const originX = parseNumberAtom(at[1], 0)
  const originY = parseNumberAtom(at[2], 0)
  const rotation = parseNumberAtom(at[3], 0)
  const mirror = fieldValue(symbol, 'mirror').toLowerCase()

  const instancePins = childrenByHead(symbol, 'pin')
    .map((pin) => (typeof pin[1] === 'string' ? pin[1].trim() : ''))
    .filter((pinNum) => pinNum.length > 0)
  const instancePinSet = new Set(instancePins)

  return templates
    // KiCad uses unit 0 for common pins (for example NE555 pins 1 and 8),
    // so those pins must be included for any selected symbol unit.
    .filter((template) => template.unit === null || template.unit === 0 || template.unit === unit)
    .filter((template) => instancePinSet.size === 0 || instancePinSet.has(template.pinNum))
    .map((template) => {
      // Library symbol coordinates use an upward Y axis, while schematic sheet
      // coordinates use downward Y. Convert after mirror/rotation.
      const transformed = symbolTransformPoint(template.x, template.y, rotation, mirror)

      return {
        pinNum: template.pinNum,
        x: originX + transformed.x,
        y: originY - transformed.y,
      }
    })
}

function wireSegments(root: Sexpr[]) {
  return childrenByHead(root, 'wire')
    .map((wire) => {
      const pts = childrenByHead(wire, 'pts')[0]
      const points = childrenByHead(pts, 'xy')

      if (points.length < 2) {
        return null
      }

      const start = points[0]
      const end = points[points.length - 1]

      return {
        x1: parseNumberAtom(start?.[1], 0),
        y1: parseNumberAtom(start?.[2], 0),
        x2: parseNumberAtom(end?.[1], 0),
        y2: parseNumberAtom(end?.[2], 0),
      }
    })
    .filter((segment): segment is { x1: number; y1: number; x2: number; y2: number } => !!segment)
}

function schematicLabelPoints(root: Sexpr[]) {
  const labels = [...childrenByHead(root, 'label'), ...childrenByHead(root, 'global_label'), ...childrenByHead(root, 'hierarchical_label')]

  return labels
    .map((label) => {
      const name = typeof label[1] === 'string' ? label[1].trim() : ''
      const at = childrenByHead(label, 'at')[0]

      if (!name || !at) {
        return null
      }

      return {
        name,
        x: parseNumberAtom(at[1], 0),
        y: parseNumberAtom(at[2], 0),
      }
    })
    .filter((entry): entry is { name: string; x: number; y: number } => !!entry)
}

function symbolNetName(symbol: Sexpr[]) {
  const libId = fieldValue(symbol, 'lib_id')
  const refDes = propertyValue(symbol, 'Reference')

  if (!libId.startsWith('power:') && !refDes.startsWith('#PWR')) {
    return ''
  }

  const value = propertyValue(symbol, 'Value')

  if (value) {
    return value
  }

  const libName = libId.split(':')[1]?.trim() ?? ''
  return libName
}

function schematicNamedPoints(root: Sexpr[], pinTemplatesByLibId: Map<string, SchematicPinTemplate[]>) {
  const namedPoints: SchematicNamedPoint[] = [...schematicLabelPoints(root)]

  for (const symbol of childrenByHead(root, 'symbol')) {
    const name = symbolNetName(symbol)

    if (!name) {
      continue
    }

    const pinPoints = symbolPinPoints(symbol, pinTemplatesByLibId)

    if (pinPoints.length > 0) {
      for (const pin of pinPoints) {
        namedPoints.push({
          name,
          x: pin.x,
          y: pin.y,
        })
      }
      continue
    }

    const at = childrenByHead(symbol, 'at')[0]

    if (!at) {
      continue
    }

    namedPoints.push({
      name,
      x: parseNumberAtom(at[1], 0),
      y: parseNumberAtom(at[2], 0),
    })
  }

  return namedPoints
}

function unionFindPoints(points: string[]) {
  const parent = new Map<string, string>()

  const add = (key: string) => {
    if (!parent.has(key)) {
      parent.set(key, key)
    }
  }

  const find = (key: string): string => {
    add(key)
    const p = parent.get(key)

    if (!p || p === key) {
      return key
    }

    const root = find(p)
    parent.set(key, root)
    return root
  }

  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)

    if (ra !== rb) {
      parent.set(rb, ra)
    }
  }

  for (const point of points) {
    add(point)
  }

  return { find, union }
}

function extractSchematicNets(root: Sexpr[], components: NetlistComponent[]): NetDef[] {
  const pinTemplatesByLibId = buildLibraryPinTemplates(root)
  const symbols = childrenByHead(root, 'symbol')
  const componentByRef = new Map(components.map((component) => [component.refDes.trim().toUpperCase(), component]))
  const symbolPins: Array<{ refDes: string; pinNum: string; x: number; y: number }> = []

  for (const symbol of symbols) {
    const refDes = propertyValue(symbol, 'Reference')

    if (!refDes || refDes.startsWith('#')) {
      continue
    }

    if (!componentByRef.has(refDes.trim().toUpperCase())) {
      continue
    }

    for (const pin of symbolPinPoints(symbol, pinTemplatesByLibId)) {
      symbolPins.push({
        refDes,
        pinNum: pin.pinNum,
        x: pin.x,
        y: pin.y,
      })
    }
  }

  const segments = wireSegments(root)
  const namedPoints = schematicNamedPoints(root, pinTemplatesByLibId)
  const allPointKeys = new Set<string>()

  for (const segment of segments) {
    allPointKeys.add(pointKey(segment.x1, segment.y1))
    allPointKeys.add(pointKey(segment.x2, segment.y2))
  }

  for (const pin of symbolPins) {
    allPointKeys.add(pointKey(pin.x, pin.y))
  }

  for (const namedPoint of namedPoints) {
    allPointKeys.add(pointKey(namedPoint.x, namedPoint.y))
  }

  if (allPointKeys.size === 0) {
    return []
  }

  const unionFind = unionFindPoints([...allPointKeys])

  for (const segment of segments) {
    unionFind.union(pointKey(segment.x1, segment.y1), pointKey(segment.x2, segment.y2))
  }

  const attachPointToSegments = (x: number, y: number) => {
    const key = pointKey(x, y)

    for (const segment of segments) {
      if (
        pointEquals(x, y, segment.x1, segment.y1)
        || pointEquals(x, y, segment.x2, segment.y2)
        || pointOnSegment(x, y, segment.x1, segment.y1, segment.x2, segment.y2)
      ) {
        unionFind.union(key, pointKey(segment.x1, segment.y1))
      }
    }
  }

  for (const pin of symbolPins) {
    attachPointToSegments(pin.x, pin.y)
  }

  for (const namedPoint of namedPoints) {
    attachPointToSegments(namedPoint.x, namedPoint.y)
  }

  const namesByGroup = new Map<string, Set<string>>()

  for (const namedPoint of namedPoints) {
    const group = unionFind.find(pointKey(namedPoint.x, namedPoint.y))
    const existing = namesByGroup.get(group)

    if (existing) {
      existing.add(namedPoint.name)
    } else {
      namesByGroup.set(group, new Set([namedPoint.name]))
    }
  }

  const nodesByGroup = new Map<string, NetNode[]>()

  for (const pin of symbolPins) {
    const group = unionFind.find(pointKey(pin.x, pin.y))
    const existing = nodesByGroup.get(group)
    const node = {
      refDes: pin.refDes,
      pinNum: pin.pinNum,
    }

    if (existing) {
      if (!existing.some((entry) => entry.refDes === node.refDes && entry.pinNum === node.pinNum)) {
        existing.push(node)
      }
    } else {
      nodesByGroup.set(group, [node])
    }
  }

  let unnamedCounter = 1
  const unnamedNets: NetDef[] = []
  const namedNets = new Map<string, NetNode[]>()

  for (const [group, nodes] of nodesByGroup.entries()) {
    if (nodes.length === 0) {
      continue
    }

    const names = [...(namesByGroup.get(group) ?? new Set<string>())]

    if (names.length > 0) {
      const name = names.slice().sort((left, right) => left.localeCompare(right))[0] ?? names[0]
      const existing = namedNets.get(name)

      if (existing) {
        for (const node of nodes) {
          if (!existing.some((entry) => entry.refDes === node.refDes && entry.pinNum === node.pinNum)) {
            existing.push(node)
          }
        }
      } else {
        namedNets.set(name, [...nodes])
      }

      continue
    }

    unnamedNets.push({
      name: `SCH_NET_${unnamedCounter++}`,
      nodes,
    })
  }

  return [
    ...[...namedNets.entries()].map<NetDef>(([name, nodes]) => ({
      name,
      nodes,
    })),
    ...unnamedNets,
  ]
}

export function parseKiCadSchematicSexpr(source: string): Netlist {
  const tokens = tokenizeSexpr(source)

  if (tokens.length === 0) {
    throw new Error('The selected file is empty.')
  }

  try {
    const forms = parseSexprTokens(tokens)
    const rootForm = forms.find((form) => Array.isArray(form) && head(form) === 'kicad_sch')
    const root = asList(rootForm)

    if (!root) {
      return parseKiCadSchematicSexprLoose(source)
    }

    const symbols = childrenByHead(root, 'symbol')
    const components = symbols
      .map<NetlistComponent>((symbol) => ({
        refDes: propertyValue(symbol, 'Reference'),
        value: propertyValue(symbol, 'Value'),
        footprintHint: propertyValue(symbol, 'Footprint') || undefined,
      }))
      .filter((component) => component.refDes.length > 0 && !component.refDes.startsWith('#'))

    if (components.length === 0) {
      return parseKiCadSchematicSexprLoose(source)
    }

    const nets = extractSchematicNets(root, components)

    return {
      components,
      nets,
    }
  } catch {
    return parseKiCadSchematicSexprLoose(source)
  }
}

export function parseKiCadNetlist(source: string): Netlist {
  const text = source.trimStart()

  if (/^\(\s*kicad_sch\b/i.test(text) || /\(\s*kicad_sch\b/i.test(text)) {
    return parseKiCadSchematicSexpr(source)
  }

  if (text.startsWith('<')) {
    return parseKiCadNetlistXml(source)
  }

  return parseKiCadNetlistSexpr(source)
}