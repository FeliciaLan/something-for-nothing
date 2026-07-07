import type { LayoutEdge, LayoutNode, TableTreeLayout } from '../types/table-tree'
import { getNodeContentFill, getNodeFill, getNodeStroke, getNodeShadow, getNodeTypeStyle, getNodeLabelFill, hexToRgba } from './style'

const EXPORT_PADDING = 28
const MAX_EXPORT_SIDE = 32767
const MAX_EXPORT_AREA = 180_000_000

const NODE_RADIUS = 8
const HEADER_RADIUS = 8
const ACCENT_BAR_WIDTH = 4
const ICON_BOX_SIZE = 34

const getExportScale = (width: number, height: number) => {
  const deviceScale = Math.min(window.devicePixelRatio || 1, 2)
  const sideScale = Math.min(MAX_EXPORT_SIDE / width, MAX_EXPORT_SIDE / height)
  const areaScale = Math.sqrt(MAX_EXPORT_AREA / Math.max(width * height, 1))
  return Math.max(Math.min(deviceScale, sideScale, areaScale), Number.EPSILON)
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
  const iconLeft = left + 12
  const iconTop = top + (node.height - ICON_BOX_SIZE) / 2
  const textLeft = iconLeft + ICON_BOX_SIZE + 10
  const badgeText = style.title

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

  context.fillStyle = hexToRgba(style.fill, selected ? 0.18 : 0.11)
  roundedRect(context, iconLeft, iconTop, ICON_BOX_SIZE, ICON_BOX_SIZE, 10)
  context.fill()

  context.strokeStyle = hexToRgba(style.fill, selected ? 0.32 : 0.18)
  context.lineWidth = 1
  roundedRect(context, iconLeft, iconTop, ICON_BOX_SIZE, ICON_BOX_SIZE, 10)
  context.stroke()

  context.fillStyle = style.fill
  context.font = '900 18px Inter, Arial, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(style.icon, iconLeft + ICON_BOX_SIZE / 2, iconTop + ICON_BOX_SIZE / 2 + 1)
  context.textAlign = 'start'

  const pillWidth = Math.min(Math.max(context.measureText(badgeText).width + 16, 42), Math.max(node.width - 82, 42))
  const pillHeight = 20
  const pillLeft = left + node.width - pillWidth - 10
  const pillTop = top + 8
  context.fillStyle = style.badgeFill
  roundedRect(context, pillLeft, pillTop, pillWidth, pillHeight, 10)
  context.fill()
  context.strokeStyle = style.badgeStroke
  context.stroke()
  context.fillStyle = style.badgeText
  context.font = '800 10px Inter, Arial, sans-serif'
  context.textBaseline = 'middle'
  context.fillText(badgeText, pillLeft + 8, pillTop + pillHeight / 2 + 0.5)

  context.fillStyle = getNodeLabelFill(node.type, selected)
  context.font = '700 13px Inter, Arial, sans-serif'
  context.textBaseline = 'top'
  drawWrappedText(context, node.label, textLeft, top + 13, Math.max(pillLeft - textLeft - 8, 64), 16, 1)

  if (node.content) {
    context.fillStyle = getNodeContentFill(node.type, selected)
    context.font = '500 12px Inter, Arial, sans-serif'
    drawWrappedText(context, node.content, textLeft, top + 36, node.width - (textLeft - left) - 32, 15, 2)
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

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const truncateText = (text: string, maxChars: number) => {
  if (text.length <= maxChars) return text
  return `${text.slice(0, Math.max(maxChars - 1, 1))}...`
}

const getExportSize = (layout: TableTreeLayout) => {
  const logicalWidth = Math.max(layout.width, 960)
  const logicalHeight = calculateLogicalHeight(layout)
  return {
    logicalWidth,
    logicalHeight,
    exportWidth: logicalWidth + EXPORT_PADDING * 2,
    exportHeight: logicalHeight + EXPORT_PADDING * 2,
  }
}

const svgRect = (x: number, y: number, width: number, height: number, fill: string, extra = '') =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${extra}/>`

const svgText = (text: string, x: number, y: number, extra = '') =>
  `<text x="${x}" y="${y}" ${extra}>${escapeXml(text)}</text>`

const renderSvgColumns = (layout: TableTreeLayout, height: number, offsetX: number, offsetY: number) =>
  layout.columnHeaders
    .map((header, index) => {
      const left = offsetX + header.x - header.width / 2
      const style = getNodeTypeStyle(header.type)
      return [
        svgRect(left, offsetY, header.width, height, index % 2 === 0 ? '#f8fafc' : '#f1f5f9'),
        `<line x1="${left + header.width}" y1="${offsetY}" x2="${left + header.width}" y2="${offsetY + height}" stroke="${style.fill}" stroke-opacity="0.2" stroke-width="1"/>`,
      ].join('')
    })
    .join('')

const renderSvgHeaders = (layout: TableTreeLayout, offsetX: number, offsetY: number) =>
  layout.columnHeaders
    .map((header) => {
      const left = offsetX + header.x - header.width / 2
      const top = offsetY + header.y - header.height / 2
      const style = getNodeTypeStyle(header.type)

      return `
        <g>
          <rect x="${left}" y="${top}" width="${header.width}" height="${header.height}" rx="${HEADER_RADIUS}" fill="#fff" stroke="${style.stroke}" stroke-width="1"/>
          <rect x="${left}" y="${top + 6}" width="${ACCENT_BAR_WIDTH}" height="${header.height - 12}" rx="2" fill="${style.fill}"/>
          ${svgText(truncateText(header.title, 18), left + 14, top + 20, 'class="svg-header-title"')}
          ${svgText(truncateText(`${header.type} · ${Math.round(header.width)}px`, 22), left + 14, top + 36, `class="svg-header-meta" fill="${style.mutedText}"`)}
        </g>
      `
    })
    .join('')

const renderSvgEdge = (edge: LayoutEdge, nodesById: Map<string, LayoutNode>, offsetX: number, offsetY: number) => {
  const source = nodesById.get(edge.source)
  const target = nodesById.get(edge.target)
  if (!source || !target) return ''

  const sourceBounds = getNodeBounds(source)
  const targetBounds = getNodeBounds(target)
  const startX = edge.sourcePort === 'right' ? sourceBounds.right : sourceBounds.left
  const endX = edge.targetPort === 'right' ? targetBounds.right : targetBounds.left
  const points: [number, number][] = [[startX, source.y], ...edge.controlPoints, [endX, target.y]]
  const d = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${offsetX + x} ${offsetY + y}`)
    .join(' ')

  return `<path d="${d}" fill="none" stroke="${edge.reversed ? '#f97316' : '#94a3b8'}" stroke-width="1.5" stroke-opacity="0.9" ${edge.reversed ? 'stroke-dasharray="6 5"' : ''}/>`
}

const renderSvgNode = (node: LayoutNode, selectedNodeId: string | undefined, offsetX: number, offsetY: number) => {
  const selected = node.id === selectedNodeId
  const style = getNodeTypeStyle(node.type)
  const bounds = getNodeBounds(node)
  const left = offsetX + bounds.left
  const top = offsetY + bounds.top
  const iconLeft = left + 12
  const iconTop = top + (node.height - ICON_BOX_SIZE) / 2
  const textLeft = iconLeft + ICON_BOX_SIZE + 10
  const badgeText = style.title
  const pillWidth = Math.min(Math.max(badgeText.length * 11 + 16, 42), Math.max(node.width - 82, 42))
  const pillHeight = 20
  const pillLeft = left + node.width - pillWidth - 10
  const pillTop = top + 8
  const contentWidth = Math.max(node.width - (textLeft - left) - 32, 48)
  const labelChars = Math.max(Math.floor((pillLeft - textLeft - 8) / 13), 4)
  const contentChars = Math.max(Math.floor(contentWidth / 11), 6)

  return `
    <g>
      <rect x="${left}" y="${top}" width="${node.width}" height="${node.height}" rx="${NODE_RADIUS}" fill="${getNodeFill(node.type, selected, false)}" stroke="${getNodeStroke(node.type, selected, false)}" stroke-width="${selected ? 2.2 : 1.2}" filter="url(#nodeShadow)"/>
      <rect x="${iconLeft}" y="${iconTop}" width="${ICON_BOX_SIZE}" height="${ICON_BOX_SIZE}" rx="10" fill="${hexToRgba(style.fill, selected ? 0.18 : 0.11)}" stroke="${hexToRgba(style.fill, selected ? 0.32 : 0.18)}"/>
      ${svgText(style.icon, iconLeft + ICON_BOX_SIZE / 2, iconTop + ICON_BOX_SIZE / 2 + 6, `class="svg-node-icon" fill="${style.fill}" text-anchor="middle"`)}
      <rect x="${pillLeft}" y="${pillTop}" width="${pillWidth}" height="${pillHeight}" rx="10" fill="${style.badgeFill}" stroke="${style.badgeStroke}"/>
      ${svgText(badgeText, pillLeft + 8, pillTop + 14, `class="svg-node-badge" fill="${style.badgeText}"`)}
      ${svgText(truncateText(node.label, labelChars), textLeft, top + 25, `class="svg-node-title" fill="${getNodeLabelFill(node.type, selected)}"`)}
      ${node.content ? svgText(truncateText(node.content, contentChars), textLeft, top + 49, `class="svg-node-content" fill="${getNodeContentFill(node.type, selected)}"`) : ''}
      ${
        node.childrenIds.length > 0
          ? `<circle cx="${left + node.width - 14}" cy="${top + node.height / 2}" r="9" fill="${style.badgeFill}" stroke="${style.badgeStroke}"/>
             ${svgText(node.collapsed ? '▸' : '▾', left + node.width - 14, top + node.height / 2 + 4, `class="svg-node-toggle" fill="${style.badgeText}" text-anchor="middle"`)}`
          : ''
      }
    </g>
  `
}

export const createTableTreeSvg = (layout: TableTreeLayout, selectedNodeId?: string) => {
  const { logicalHeight, exportWidth, exportHeight } = getExportSize(layout)
  const offsetX = EXPORT_PADDING
  const offsetY = EXPORT_PADDING
  const nodesById = new Map(layout.nodes.map((node) => [node.id, node]))

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">
  <defs>
    <filter id="nodeShadow" x="-20%" y="-30%" width="140%" height="170%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.08"/>
    </filter>
    <style>
      text { font-family: Inter, Arial, sans-serif; dominant-baseline: alphabetic; }
      .svg-header-title { fill: #0f172a; font-size: 13px; font-weight: 800; }
      .svg-header-meta { font-size: 11px; font-weight: 700; }
      .svg-node-icon { font-size: 18px; font-weight: 900; }
      .svg-node-title { font-size: 13px; font-weight: 700; }
      .svg-node-content { font-size: 12px; font-weight: 500; }
      .svg-node-badge { font-size: 10px; font-weight: 800; }
      .svg-node-toggle { font-size: 11px; font-weight: 800; }
    </style>
  </defs>
  ${svgRect(0, 0, exportWidth, exportHeight, '#f8fafc')}
  ${renderSvgColumns(layout, logicalHeight, offsetX, offsetY)}
  ${renderSvgHeaders(layout, offsetX, offsetY)}
  ${layout.edges.map((edge) => renderSvgEdge(edge, nodesById, offsetX, offsetY)).join('')}
  ${layout.nodes.map((node) => renderSvgNode(node, selectedNodeId, offsetX, offsetY)).join('')}
</svg>`
}

export const downloadTableTreeSvg = (
  layout: TableTreeLayout,
  selectedNodeId?: string,
  fileName = `table-tree-${new Date().toISOString().slice(0, 10)}.svg`,
) => {
  const svg = createTableTreeSvg(layout, selectedNodeId)
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), fileName)
  return {
    width: Math.max(layout.width, 960) + EXPORT_PADDING * 2,
    height: calculateLogicalHeight(layout) + EXPORT_PADDING * 2,
  }
}

export const downloadTableTreeImage = async (
  layout: TableTreeLayout,
  selectedNodeId?: string,
  fileName = `table-tree-${new Date().toISOString().slice(0, 10)}.png`,
) => {
  const { logicalHeight, exportWidth, exportHeight } = getExportSize(layout)
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
