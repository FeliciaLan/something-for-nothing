import type { TableTreeStore, VisibleNode } from '../types/table-tree'

export const getVisibleNodes = (store: TableTreeStore): VisibleNode[] => {
  const visibleNodes: VisibleNode[] = []
  const visited = new Set<string>()

  const visit = (nodeId: string, depth: number, path: string[]) => {
    const node = store.nodesById[nodeId]
    if (!node || visited.has(nodeId)) return

    visited.add(nodeId)
    visibleNodes.push({
      id: node.id,
      type: node.type,
      label: node.label,
      content: node.content,
      parentId: node.parentId,
      childrenIds: [...node.childrenIds],
      depth,
      pathKey: [...path, node.id].join('/'),
      collapsed: Boolean(node.collapsed),
      manualY: node.manualY,
    })

    if (!node.collapsed) {
      node.childrenIds.forEach((childId) => visit(childId, depth + 1, [...path, node.id]))
    }
  }

  store.rootIds.forEach((rootId) => visit(rootId, 0, []))
  return visibleNodes
}

export const getVisibleStats = (store: TableTreeStore) => {
  const totalNodes = Object.keys(store.nodesById).length
  const visibleNodes = getVisibleNodes(store)
  const visibleEdges = visibleNodes.filter((node) => node.parentId && store.nodesById[node.parentId]).length

  return {
    totalNodes,
    visibleNodes: visibleNodes.length,
    visibleEdges,
  }
}
