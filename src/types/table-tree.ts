export interface TableTreeColumn {
  id: string
  type: string
  title: string
  width: number
  visible: boolean
  order: number
}

export interface TableTreeNode {
  id: string
  type: string
  label: string
  content?: string
  parentId?: string
  childrenIds: string[]
  collapsed?: boolean
  manualY?: number
  hasChildren?: boolean
  childrenLoaded?: boolean
  data?: Record<string, unknown>
}

export interface TableTreeStore {
  rootIds: string[]
  nodesById: Record<string, TableTreeNode>
  columns: TableTreeColumn[]
  selectedNodeId?: string
}

export interface VisibleNode {
  id: string
  type: string
  label: string
  content?: string
  parentId?: string
  childrenIds: string[]
  depth: number
  pathKey: string
  collapsed: boolean
  manualY?: number
}

export interface LayoutNode extends VisibleNode {
  x: number
  y: number
  width: number
  height: number
  columnId: string
  columnIndex: number
}

export interface LayoutColumnHeader {
  id: string
  columnId: string
  type: string
  title: string
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutEdge {
  id: string
  source: string
  target: string
  reversed: boolean
  sourcePort: 'left' | 'right'
  targetPort: 'left' | 'right'
  controlPoints: [number, number][]
}

export type TableTreeLayoutMode = 'table' | 'ecological'

export interface TableTreeLayout {
  columnHeaders: LayoutColumnHeader[]
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
  columnStarts: Record<string, number>
}

export interface AddNodePayload {
  type: string
  label: string
  content?: string
}
