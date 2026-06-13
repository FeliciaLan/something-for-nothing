import type {
  LayoutEdge,
  LayoutNode,
  TableTreeColumn,
  TableTreeLayout,
  TableTreeLayoutMode,
  TableTreeStore,
  VisibleNode,
} from '../types/table-tree'
import { getVisibleNodes } from './visible'

const ROW_HEIGHT = 82
const NODE_HEIGHT = 54
const HEADER_HEIGHT = 44
const COLUMN_GAP = 42
const TOP_PADDING = 82
const LEFT_PADDING = 24
const NODE_GAP = 24
const ECO_LEAF_HEIGHT = 68
const ECO_SIBLING_GAP = 18
const ECO_SUBTREE_GAP = 44

const getOrderedVisibleColumns = (columns: TableTreeColumn[]) =>
  columns
    .filter((column) => column.visible)
    .slice()
    .sort((a, b) => a.order - b.order)

const calculateColumnStarts = (columns: TableTreeColumn[]) => {
  let cursor = LEFT_PADDING
  const starts: Record<string, number> = {}

  columns.forEach((column) => {
    starts[column.type] = cursor
    cursor += column.width + COLUMN_GAP
  })

  return starts
}

const getVisibleTreeMaps = (nodes: VisibleNode[]) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const visibleChildren = new Map<string, string[]>()

  nodes.forEach((node) => {
    const children = node.childrenIds.filter((childId) => nodeMap.has(childId))
    visibleChildren.set(node.id, children)
  })

  return {
    nodeMap,
    roots: nodes.filter((node) => !node.parentId || !nodeMap.has(node.parentId)).map((node) => node.id),
    visibleChildren,
  }
}

const calculateTableRows = (nodes: VisibleNode[]) => {
  const { roots, visibleChildren } = getVisibleTreeMaps(nodes)
  const yById = new Map<string, number>()
  let row = 0

  const assign = (nodeId: string): number => {
    const children = visibleChildren.get(nodeId) ?? []

    if (children.length === 0) {
      const y = TOP_PADDING + row * ROW_HEIGHT
      row += 1
      yById.set(nodeId, y)
      return y
    }

    const childYs = children.map(assign)
    const y = (childYs[0] + childYs[childYs.length - 1]) / 2
    yById.set(nodeId, y)
    return y
  }

  roots.forEach((nodeId) => assign(nodeId))

  return {
    yById,
    contentHeight: TOP_PADDING + Math.max(row, 1) * ROW_HEIGHT,
  }
}

const calculateEcologicalRows = (nodes: VisibleNode[]) => {
  const { roots, visibleChildren } = getVisibleTreeMaps(nodes)
  const yById = new Map<string, number>()
  const subtreeHeightById = new Map<string, number>()

  const measure = (nodeId: string): number => {
    const children = visibleChildren.get(nodeId) ?? []

    if (children.length === 0) {
      subtreeHeightById.set(nodeId, ECO_LEAF_HEIGHT)
      return ECO_LEAF_HEIGHT
    }

    const childHeights = children.map(measure)
    const childrenHeight = childHeights.reduce((sum, height) => sum + height, 0)
    const childGaps = children.slice(1).reduce((sum, childId, index) => {
      const previousId = children[index]
      const previousHeight = subtreeHeightById.get(previousId) ?? ECO_LEAF_HEIGHT
      const currentHeight = subtreeHeightById.get(childId) ?? ECO_LEAF_HEIGHT
      const adaptiveGap = Math.min((previousHeight + currentHeight) / 16, 48)
      return sum + ECO_SIBLING_GAP + adaptiveGap
    }, 0)
    const height = Math.max(ECO_LEAF_HEIGHT, childrenHeight + childGaps)
    subtreeHeightById.set(nodeId, height)
    return height
  }

  const assign = (nodeId: string, top: number) => {
    const children = visibleChildren.get(nodeId) ?? []
    const height = subtreeHeightById.get(nodeId) ?? ECO_LEAF_HEIGHT

    if (children.length === 0) {
      yById.set(nodeId, top + height / 2)
      return
    }

    let cursor = top
    children.forEach((childId, index) => {
      const childHeight = subtreeHeightById.get(childId) ?? ECO_LEAF_HEIGHT
      assign(childId, cursor)
      cursor += childHeight

      if (index < children.length - 1) {
        const nextHeight = subtreeHeightById.get(children[index + 1]) ?? ECO_LEAF_HEIGHT
        cursor += ECO_SIBLING_GAP + Math.min((childHeight + nextHeight) / 16, 48)
      }
    })

    const firstChildY = yById.get(children[0]) ?? top + height / 2
    const lastChildY = yById.get(children[children.length - 1]) ?? top + height / 2
    yById.set(nodeId, (firstChildY + lastChildY) / 2)
  }

  let cursor = TOP_PADDING
  roots.forEach((rootId, index) => {
    const height = measure(rootId)
    assign(rootId, cursor)
    cursor += height
    if (index < roots.length - 1) cursor += ECO_SUBTREE_GAP
  })

  return {
    yById,
    contentHeight: Math.max(cursor, TOP_PADDING + ECO_LEAF_HEIGHT),
  }
}

const calculateRows = (nodes: VisibleNode[], mode: TableTreeLayoutMode) =>
  mode === 'ecological' ? calculateEcologicalRows(nodes) : calculateTableRows(nodes)

export const buildTableTreeLayout = (store: TableTreeStore, mode: TableTreeLayoutMode = 'table'): TableTreeLayout => {
  const visibleColumns = getOrderedVisibleColumns(store.columns)
  const visibleNodes = getVisibleNodes(store)
  const columnStarts = calculateColumnStarts(visibleColumns)
  const columnByType = new Map(visibleColumns.map((column, index) => [column.type, { ...column, index }]))
  const { yById, contentHeight } = calculateRows(visibleNodes, mode)
  const fallbackX = LEFT_PADDING + visibleColumns.length * (180 + COLUMN_GAP)
  const columnHeaders = visibleColumns.map((column) => ({
    id: `column-header-${column.id}`,
    columnId: column.id,
    type: column.type,
    title: column.title,
    x: columnStarts[column.type] + column.width / 2,
    y: 36,
    width: column.width,
    height: HEADER_HEIGHT,
  }))

  const nodes: LayoutNode[] = visibleNodes.map((node) => {
    const column = columnByType.get(node.type)
    const width = column?.width ?? 170

    return {
      ...node,
      x: column ? columnStarts[node.type] + width / 2 : fallbackX + width / 2,
      y: yById.get(node.id) ?? TOP_PADDING,
      width,
      height: NODE_HEIGHT,
      columnId: column?.id ?? 'unknown',
      columnIndex: column?.index ?? visibleColumns.length,
    }
  })

  const nodesByColumn = new Map<string, LayoutNode[]>()
  nodes.forEach((node) => {
    const columnNodes = nodesByColumn.get(node.columnId) ?? []
    columnNodes.push(node)
    nodesByColumn.set(node.columnId, columnNodes)
  })
  nodesByColumn.forEach((columnNodes) => {
    columnNodes
      .sort((a, b) => a.y - b.y)
      .reduce((previousBottom, node) => {
        const minY = previousBottom + node.height / 2 + NODE_GAP
        if (node.y < minY) node.y = minY
        return node.y + node.height / 2
      }, TOP_PADDING - NODE_GAP)
  })

  const layoutNodeById = new Map(nodes.map((node) => [node.id, node]))
  const edges: LayoutEdge[] = nodes
    .filter((node) => node.parentId && layoutNodeById.has(node.parentId))
    .map((node) => {
      const parent = layoutNodeById.get(node.parentId!)!
      const movesRight = node.x >= parent.x
      const sourcePort = movesRight ? 'right' : 'left'
      const targetPort = movesRight ? 'left' : 'right'
      const sourceBoundaryX = parent.x + (movesRight ? parent.width / 2 : -parent.width / 2)
      const targetBoundaryX = node.x + (movesRight ? -node.width / 2 : node.width / 2)
      const fallbackOffset = movesRight ? COLUMN_GAP / 2 : -COLUMN_GAP / 2
      const midX =
        Math.abs(targetBoundaryX - sourceBoundaryX) < COLUMN_GAP
          ? sourceBoundaryX + fallbackOffset
          : (sourceBoundaryX + targetBoundaryX) / 2

      return {
        id: `${parent.id}->${node.id}`,
        source: parent.id,
        target: node.id,
        reversed: parent.columnIndex > node.columnIndex,
        sourcePort,
        targetPort,
        controlPoints: [
          [midX, parent.y],
          [midX, node.y],
        ],
      }
    })

  const width =
    LEFT_PADDING * 2 +
    visibleColumns.reduce((sum, column) => sum + column.width, 0) +
    Math.max(visibleColumns.length - 1, 0) * COLUMN_GAP
  const maxNodeBottom = nodes.reduce((max, node) => Math.max(max, node.y + node.height / 2), contentHeight)
  const height = HEADER_HEIGHT + TOP_PADDING + maxNodeBottom

  return {
    columnHeaders,
    nodes,
    edges,
    width: Math.max(width, 960),
    height: Math.max(height, 560),
    columnStarts,
  }
}
