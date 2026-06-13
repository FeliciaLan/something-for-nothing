import type { LayoutEdge, LayoutNode, TableTreeColumn, TableTreeLayout, TableTreeStore, VisibleNode } from '../types/table-tree'
import { getVisibleNodes } from './visible'

const ROW_HEIGHT = 82
const NODE_HEIGHT = 54
const HEADER_HEIGHT = 44
const COLUMN_GAP = 42
const TOP_PADDING = 82
const LEFT_PADDING = 24
const NODE_GAP = 24

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

const calculateRows = (nodes: VisibleNode[]) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const visibleChildren = new Map<string, string[]>()
  const yById = new Map<string, number>()
  let row = 0

  nodes.forEach((node) => {
    const children = node.childrenIds.filter((childId) => nodeMap.has(childId))
    visibleChildren.set(node.id, children)
  })

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

  nodes.filter((node) => !node.parentId || !nodeMap.has(node.parentId)).forEach((node) => assign(node.id))

  return {
    yById,
    rows: Math.max(row, 1),
  }
}

export const buildTableTreeLayout = (store: TableTreeStore): TableTreeLayout => {
  const visibleColumns = getOrderedVisibleColumns(store.columns)
  const visibleNodes = getVisibleNodes(store)
  const columnStarts = calculateColumnStarts(visibleColumns)
  const columnByType = new Map(visibleColumns.map((column, index) => [column.type, { ...column, index }]))
  const { yById, rows } = calculateRows(visibleNodes)
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
  const height = HEADER_HEIGHT + TOP_PADDING + rows * ROW_HEIGHT

  return {
    columnHeaders,
    nodes,
    edges,
    width: Math.max(width, 960),
    height: Math.max(height, 560),
    columnStarts,
  }
}
