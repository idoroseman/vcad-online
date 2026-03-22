export type StorageMode = 'local' | 'cloud'
export type WireType = 'power' | 'gnd' | 'input' | 'output' | 'bidirectional'
export type ActiveTool = 'inspect' | 'link' | 'wire' | 'cut' | 'component'

export interface Cut {
  id: string
  row: number
  col: number
}

export interface Link {
  id: string
  fromRow: number
  fromCol: number
  toRow: number
  toCol: number
  color?: string
}

export interface Wire {
  id: string
  row: number
  col: number
  signalName: string
  type: WireType
  note?: string
}

export interface PlacedComponent {
  id: string
  footprintId: string
  refDes: string
  value: string
  row: number
  col: number
  rotation: 0 | 1 | 2 | 3
  leadPitch?: number
  bodyRadius?: number
  dipPins?: number
  dipWidth?: number
}

export interface NetNode {
  refDes: string
  pinNum: string
}

export interface NetDef {
  name: string
  nodes: NetNode[]
}

export interface NetlistComponent {
  refDes: string
  value: string
  footprintHint?: string
}

export interface Netlist {
  nets: NetDef[]
  components: NetlistComponent[]
}

export interface BoardState {
  rows: number
  cols: number
  components: PlacedComponent[]
  cuts: Cut[]
  links: Link[]
  wires: Wire[]
  netlist: Netlist | null
  storageMode: StorageMode
  projectName: string
}