import type { GraphData } from '@antv/g6'
import type { TableTreeLayout } from '../types/table-tree'

export const toG6Data = (layout: TableTreeLayout, selectedNodeId?: string): GraphData => ({
  nodes: layout.nodes.map((node) => ({
      id: node.id,
      data: {
        kind: 'tree-node',
        label: node.label,
        content: node.content,
        type: node.type,
        depth: node.depth,
        collapsed: node.collapsed,
        hasChildren: node.childrenIds.length > 0,
        selected: node.id === selectedNodeId,
      },
      style: {
        x: node.x,
        y: node.y,
        size: [node.width, node.height] as [number, number],
      },
    })),
  edges: layout.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    data: {
      reversed: edge.reversed,
    },
    style: {
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
      controlPoints: edge.controlPoints,
    },
  })),
})
