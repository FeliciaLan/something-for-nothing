import type { LayoutEdge, LayoutNode, TableTreeLayout } from '../types/table-tree'
import { getNodeFill, getNodeStroke, getNodeShadow, getNodeTypeStyle, getNodeLabelFill } from './style'

const EXPORT_PADDING = 28
const MAX_EXPORT_SIDE = 16384
const MAX_EXPORT_AREA = 64_000_000
const MIN_EXPORT_SCALE = 0.08

const NODE_RADIUS = 8
const HEADER_RADIUS = 8
const ACCENT_BAR_WIDTH = 4

const getExportScale = (width: number, height: number) => {
  const deviceScale = Math.min(window.devicePixelRatio || 1, 2)
  const sideScale = Math.min(MAX_EXPORT_SIDE / width, MAX_EXPORT_SIDE / height)
  const areaScale = Math.sqrt(MAX_EXPORT_AREA / Math.max(width * height, 1))
  return Math.max(Math.min(deviceScale, sideScale, areaScale), MIN_EXPORT_SCALE)
}

const roundedRect = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  const safeRadius = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + safeRadius, y)
  context.lineTo(x + width - safeRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius)
  context.lineTo(x + width, y + height - safeRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height)
  context.lineTo(x + safeRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius)
  context.lineTo(x, y + safeRadius)
  context.quadraticCurveTo(x, y, x + safeRadius, y)
  context.closePath()
}

const drawWrappedText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) => {
  const chars = Array.from(text)
  const lines: string[] = []
  let line = ''

  chars.forEach((char) => {
    const next = line + char
    if (context.measureText(next).width <= maxWidth || !line) {
      line = next
      return
    }
    lines.push(line)
    line = char
  })
  if (line) lines.push(line)

  lines.slice(0, maxLines).forEach((item, index) => {
    const value = index === maxLines - 1 && lines.length > maxLines ? `${item.slice(0, Math.max(item.length - 1, 1))}...` : item
    context.fillText(value, x, y + index * lineHeight)
  })
}

const getNodeBounds = (node: LayoutNode) => ({
  left: node.x - node.width / 2,
  right: node.x + node.width / 2,
  top: node.y - node.height / 2,
  bottom: node.y + node.height / 2,
})

const drawColumns = (context: CanvasRenderingContext2D, layout: TableTreeLayout, height: number, offsetX: number, offsetY: number) => {
  layout.columnHeaders.forEach((header, index) => {
    const left = offsetX + header.x - header.width / 2
    const style = getNodeTypeStyle(header.type)
    context.fillStyle = index % 2 === 0 ? '#f8fafc' : '#f1f5f9'
    context.fillRect(left, offsetY, header.width, height)

    context.strokeStyle = `${style.fill}33`
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(left + header.width, offsetY)
    context.lineTo(left + header.width, offsetY + height)
    context.stroke()
  })
}

const drawHeaders = (context: CanvasRenderingContext2D, layout: TableTreeLayout, offsetX: number, offsetY: number) => {
  layout.columnHeaders.forEach((header) => {
    const left = offsetX + header.x - header.width / 2
    const top = offsetY + header.y - header.height / 2
    const style = getNodeTypeStyle(header.type)

    context.fillStyle = '#ffffff'
    roundedRect(context, left, top, header.width, header.height, HEADER_RADIUS)
    context.fill()

    context.strokeStyle = style.stroke
    context.lineWidth = 1
    context.stroke()

    context.fillStyle = style.fill
    const accentHeight = header.height - 12
    roundedRect(context, left, top + 6, ACCENT_BAR_WIDTH, accentHeight, 2)
    context.fill()

    context.fillStyle = '#0f172a'
    context.font = '800 13px Inter, Arial, sans-serif'
    context.textBaseline = 'top'
    drawWrappedText(context, header.title, left + 14, top + 8, header.width - 28, 16, 1)

    context.fillStyle = style.mutedText
    context.font = '700 11px Inter, Arial, sans-serif'
    drawWrappedText(context, `${header.type} · ${Math.round(header.width)}px`, left + 14, top + 25, header.width - 28, 13, 1)
  })
}

const drawEdge = (
  context: CanvasRenderingContext2D,
  edge: LayoutEdge,
  nodesById: Map<string, LayoutNode>,
  offsetX: number,
  offsetY: number,
) => {
  const source = nodesById.get(edge.source)
  const target = nodesById.get(edge.target)
  if (!source || !target) return

  const sourceBounds = getNodeBounds(source)
  const targetBounds = getNodeBounds(target)
  const startX = edge.sourcePort === 'right' ? sourceBounds.right : sourceBounds.left
  const endX = edge.targetPort === 'right' ? targetBounds.right : targetBounds.left
  const points: [number, number][] = [[startX, source.y], ...edge.controlPoints, [endX, target.y]]

  context.save()
  context.strokeStyle = edge.reversed ? '#f97316' : '#94a3b8'
  context.lineWidth = 1.5
  context.globalAlpha = 0.9
  if (edge.reversed) context.setLineDash([6, 5])
  context.beginPath()
  points.forEach(([x, y], index) => {
    const px = offsetX + x
    const py = offsetY + y
    if (index === 0) context.moveTo(px, py)
    else context.lineTo(px, py)
  })
  context.stroke()
  context.restore()
}

const drawNode = (
  context: CanvasRenderingContext2D,
  node: LayoutNode,
  selectedNodeId: string | undefined,
  offsetX: number,
  offsetY: number,
) => {
  const selected = node.id === selectedNodeId
  const style = getNodeTypeStyle(node.type)
  const bounds = getNodeBounds(node)
  const left = offsetX + bounds.left
  const top = offsetY + bounds.top

  context.save()
  context.shadowColor = getNodeShadow(node.type, selected)
  context.shadowBlur = selected ? 16 : 10
  context.shadowOffsetY = 4
  context.fillStyle = getNodeFill(node.type, selected, false)
  roundedRect(context, left, top, node.width, node.height, NODE_RADIUS)
  context.fill()
  context.restore()

  context.strokeStyle = getNodeStroke(node.type, selected, false)
  context.lineWidth = selected ? 2.2 : 1.2
  roundedRect(context, left, top, node.width, node.height, NODE_RADIUS)
  context.stroke()

  context.fillStyle = style.fill
  const accentHeight = node.height - 12
  roundedRect(context, left + 5, top + 6, ACCENT_BAR_WIDTH, accentHeight, 2)
  context.fill()

  context.fillStyle = getNodeLabelFill(node.type, selected)
  context.font = '700 13px Inter, Arial, sans-serif'
  context.textBaseline = 'top'
  drawWrappedText(context, node.label, left + 16, top + 10, node.width - 30, 16, 1)

  if (node.content) {
    context.fillStyle = style.mutedText
    context.font = '500 12px Inter, Arial, sans-serif'
    drawWrappedText(context, node.content, left + 16, top + 29, node.width - 30, 15, 1)
  }

  if (node.childrenIds.length > 0) {
    const badgeSize = 18
    const badgeX = left + node.width - badgeSize / 2 - 5
    const badgeY = top + node.height / 2
    context.fillStyle = style.badgeFill
    context.strokeStyle = style.badgeStroke
    context.lineWidth = 1
    context.beginPath()
    context.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2)
    context.fill()
    context.stroke()

    context.fillStyle = style.badgeText
    context.font = '800 11px Inter, Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(node.collapsed ? '▸' : '▾', badgeX, badgeY)
    context.textAlign = 'start'
  }
}

const calculateLogicalHeight = (layout: TableTreeLayout) => {
  const nodeBottom = layout.nodes.reduce((max, node) => Math.max(max, node.y + node.height / 2), 0)
  const headerBottom = layout.columnHeaders.reduce((max, header) => Math.max(max, header.y + header.height / 2), 0)
  const edgeBottom = layout.edges.reduce(
    (max, edge) => Math.max(max, ...edge.controlPoints.map((point) => point[1])),
    0,
  )
  return Math.max(layout.height, nodeBottom + EXPORT_PADDING, headerBottom + EXPORT_PADDING, edgeBottom + EXPORT_PADDING, 560)
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export const downloadTableTreeImage = async (
  layout: TableTreeLayout,
  selectedNodeId?: string,
  fileName = `table-tree-${new Date().toISOString().slice(0, 10)}.png`,
) => {
  const logicalWidth = Math.max(layout.width, 960)
  const logicalHeight = calculateLogicalHeight(layout)
  const exportWidth = logicalWidth + EXPORT_PADDING * 2
  const exportHeight = logicalHeight + EXPORT_PADDING * 2
  const scale = getExportScale(exportWidth, exportHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(Math.floor(exportWidth * scale), 1)
  canvas.height = Math.max(Math.floor(exportHeight * scale), 1)

  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器不支持 Canvas 导出。')

  context.scale(scale, scale)
  context.fillStyle = '#f8fafc'
  context.fillRect(0, 0, exportWidth, exportHeight)

  const offsetX = EXPORT_PADDING
  const offsetY = EXPORT_PADDING
  drawColumns(context, layout, logicalHeight, offsetX, offsetY)
  drawHeaders(context, layout, offsetX, offsetY)

  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]))
  layout.edges.forEach((edge) => drawEdge(context, edge, nodesById, offsetX, offsetY))
  layout.nodes.forEach((node) => drawNode(context, node, selectedNodeId, offsetX, offsetY))

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value)
      else reject(new Error('图片导出失败，请尝试折叠部分节点后重试。'))
    }, 'image/png')
  })

  downloadBlob(blob, fileName)
  return {
    width: canvas.width,
    height: canvas.height,
    scale,
  }
}
