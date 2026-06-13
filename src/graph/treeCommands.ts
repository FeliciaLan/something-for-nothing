import type { AddNodePayload, TableTreeColumn, TableTreeNode, TableTreeStore } from '../types/table-tree'

const cloneStore = (store: TableTreeStore): TableTreeStore => ({
  rootIds: [...store.rootIds],
  selectedNodeId: store.selectedNodeId,
  columns: store.columns.map((column) => ({ ...column })),
  nodesById: Object.fromEntries(
    Object.entries(store.nodesById).map(([id, node]) => [id, { ...node, childrenIds: [...node.childrenIds] }]),
  ),
})

const createId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`

const normalizeOrders = (columns: TableTreeColumn[]) =>
  columns
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((column, order) => ({ ...column, order }))

const collectSubtreeIds = (store: TableTreeStore, nodeId: string, result = new Set<string>()) => {
  const node = store.nodesById[nodeId]
  if (!node || result.has(nodeId)) return result

  result.add(nodeId)
  node.childrenIds.forEach((childId) => collectSubtreeIds(store, childId, result))
  return result
}

const wouldCreateCycle = (store: TableTreeStore, nodeId: string, newParentId: string) => {
  let current: string | undefined = newParentId

  while (current) {
    if (current === nodeId) return true
    current = store.nodesById[current]?.parentId
  }

  return false
}

export const tableTreeCommands = {
  addColumn(store: TableTreeStore, title: string): TableTreeStore {
    const next = cloneStore(store)
    const id = createId('col')
    const type = `type_${next.columns.length + 1}`

    next.columns = normalizeOrders([
      ...next.columns,
      {
        id,
        type,
        title: title.trim() || `新列${next.columns.length + 1}`,
        width: 180,
        visible: true,
        order: next.columns.length,
      },
    ])

    return next
  },

  removeColumn(store: TableTreeStore, columnId: string): TableTreeStore {
    const next = cloneStore(store)
    next.columns = normalizeOrders(next.columns.map((column) => (column.id === columnId ? { ...column, visible: false } : column)))
    return next
  },

  restoreColumn(store: TableTreeStore, columnId: string): TableTreeStore {
    const next = cloneStore(store)
    next.columns = normalizeOrders(next.columns.map((column) => (column.id === columnId ? { ...column, visible: true } : column)))
    return next
  },

  moveColumn(store: TableTreeStore, columnId: string, direction: -1 | 1): TableTreeStore {
    const next = cloneStore(store)
    const ordered = normalizeOrders(next.columns)
    const index = ordered.findIndex((column) => column.id === columnId)
    const targetIndex = index + direction

    if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return store

    const [column] = ordered.splice(index, 1)
    ordered.splice(targetIndex, 0, column)
    next.columns = normalizeOrders(ordered)
    return next
  },

  updateColumnWidth(store: TableTreeStore, columnId: string, width: number): TableTreeStore {
    return {
      ...store,
      columns: store.columns.map((column) =>
        column.id === columnId ? { ...column, width: Math.max(120, Math.min(width, 420)) } : column,
      ),
    }
  },

  addNode(store: TableTreeStore, parentId: string | undefined, payload: AddNodePayload): TableTreeStore {
    const next = cloneStore(store)
    const id = createId(payload.type)
    const node: TableTreeNode = {
      id,
      type: payload.type,
      label: payload.label.trim() || '新节点',
      content: payload.content?.trim(),
      parentId,
      childrenIds: [],
    }

    next.nodesById[id] = node

    if (parentId && next.nodesById[parentId]) {
      next.nodesById[parentId].childrenIds.push(id)
      next.nodesById[parentId].collapsed = false
    } else {
      next.rootIds.push(id)
      delete node.parentId
    }

    next.selectedNodeId = id
    return next
  },

  removeNode(store: TableTreeStore, nodeId: string): TableTreeStore {
    const next = cloneStore(store)
    const node = next.nodesById[nodeId]
    if (!node) return store
    if (!node.parentId && next.rootIds.length === 1) return store

    const idsToDelete = collectSubtreeIds(next, nodeId)
    if (node.parentId && next.nodesById[node.parentId]) {
      next.nodesById[node.parentId].childrenIds = next.nodesById[node.parentId].childrenIds.filter((id) => id !== nodeId)
      next.selectedNodeId = node.parentId
    } else {
      next.rootIds = next.rootIds.filter((id) => id !== nodeId)
      next.selectedNodeId = next.rootIds[0]
    }

    idsToDelete.forEach((id) => delete next.nodesById[id])
    return next
  },

  removePath(store: TableTreeStore, leafId: string): TableTreeStore {
    const next = cloneStore(store)
    if (next.rootIds.length === 1 && leafId === next.rootIds[0]) return store
    let currentId: string | undefined = leafId

    while (currentId) {
      const current: TableTreeNode | undefined = next.nodesById[currentId]
      if (!current) break

      const parentId: string | undefined = current.parentId
      delete next.nodesById[currentId]

      if (parentId && next.nodesById[parentId]) {
        next.nodesById[parentId].childrenIds = next.nodesById[parentId].childrenIds.filter((id) => id !== currentId)
        if (next.nodesById[parentId].childrenIds.length > 0) break
      } else {
        next.rootIds = next.rootIds.filter((id) => id !== currentId)
      }

      currentId = parentId
    }

    next.selectedNodeId = next.rootIds[0]
    return next
  },

  moveNode(store: TableTreeStore, nodeId: string, newParentId: string | undefined): TableTreeStore {
    const next = cloneStore(store)
    const node = next.nodesById[nodeId]
    if (!node || nodeId === newParentId) return store
    if (newParentId && (!next.nodesById[newParentId] || wouldCreateCycle(next, nodeId, newParentId))) return store

    if (node.parentId && next.nodesById[node.parentId]) {
      next.nodesById[node.parentId].childrenIds = next.nodesById[node.parentId].childrenIds.filter((id) => id !== nodeId)
    } else {
      next.rootIds = next.rootIds.filter((id) => id !== nodeId)
    }

    if (newParentId) {
      node.parentId = newParentId
      next.nodesById[newParentId].childrenIds.push(nodeId)
      next.nodesById[newParentId].collapsed = false
    } else {
      delete node.parentId
      next.rootIds.push(nodeId)
    }

    next.selectedNodeId = nodeId
    return next
  },

  updateNodeType(store: TableTreeStore, nodeId: string, type: string): TableTreeStore {
    const next = cloneStore(store)
    if (!next.nodesById[nodeId]) return store
    next.nodesById[nodeId].type = type
    return next
  },

  updateNodeLabel(store: TableTreeStore, nodeId: string, label: string): TableTreeStore {
    const next = cloneStore(store)
    if (!next.nodesById[nodeId]) return store
    next.nodesById[nodeId].label = label.trim() || next.nodesById[nodeId].label
    return next
  },

  updateNodeContent(store: TableTreeStore, nodeId: string, content: string): TableTreeStore {
    const next = cloneStore(store)
    if (!next.nodesById[nodeId]) return store
    next.nodesById[nodeId].content = content
    return next
  },

  toggleCollapse(store: TableTreeStore, nodeId: string): TableTreeStore {
    const next = cloneStore(store)
    if (!next.nodesById[nodeId]) return store
    next.nodesById[nodeId].collapsed = !next.nodesById[nodeId].collapsed
    next.selectedNodeId = nodeId
    return next
  },

  selectNode(store: TableTreeStore, nodeId: string): TableTreeStore {
    if (!store.nodesById[nodeId]) return store
    return { ...store, selectedNodeId: nodeId }
  },
}
