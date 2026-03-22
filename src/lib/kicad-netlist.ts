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

export function parseKiCadNetlist(source: string): Netlist {
  const text = source.trimStart()

  if (text.startsWith('<')) {
    return parseKiCadNetlistXml(source)
  }

  return parseKiCadNetlistSexpr(source)
}