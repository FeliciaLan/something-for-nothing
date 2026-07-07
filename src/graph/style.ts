export interface NodeTypeStyle {
  icon: string
  title: string
  fill: string
  softFill: string
  hoverFill: string
  selectedFill: string
  stroke: string
  text: string
  mutedText: string
  badgeFill: string
  badgeStroke: string
  badgeText: string
}

export const NODE_TYPE_STYLES: Record<string, NodeTypeStyle> = {
  domain: {
    icon: '◆',
    title: '领域',
    fill: '#1d4ed8',
    softFill: '#eff6ff',
    hoverFill: '#dbeafe',
    selectedFill: '#bfdbfe',
    stroke: '#bfdbfe',
    text: '#1e3a8a',
    mutedText: '#3b82f6',
    badgeFill: '#dbeafe',
    badgeStroke: '#93c5fd',
    badgeText: '#1d4ed8',
  },
  system: {
    icon: '◈',
    title: '系统',
    fill: '#7c3aed',
    softFill: '#f5f3ff',
    hoverFill: '#ede9fe',
    selectedFill: '#ddd6fe',
    stroke: '#ddd6fe',
    text: '#4c1d95',
    mutedText: '#8b5cf6',
    badgeFill: '#ede9fe',
    badgeStroke: '#c4b5fd',
    badgeText: '#7c3aed',
  },
  module: {
    icon: '▣',
    title: '模块',
    fill: '#0f766e',
    softFill: '#f0fdfa',
    hoverFill: '#ccfbf1',
    selectedFill: '#99f6e4',
    stroke: '#99f6e4',
    text: '#134e4a',
    mutedText: '#14b8a6',
    badgeFill: '#ccfbf1',
    badgeStroke: '#5eead4',
    badgeText: '#0f766e',
  },
  page: {
    icon: '▤',
    title: '页面',
    fill: '#ea580c',
    softFill: '#fff7ed',
    hoverFill: '#ffedd5',
    selectedFill: '#fed7aa',
    stroke: '#fed7aa',
    text: '#7c2d12',
    mutedText: '#f97316',
    badgeFill: '#ffedd5',
    badgeStroke: '#fdba74',
    badgeText: '#ea580c',
  },
  api: {
    icon: '⌁',
    title: '接口',
    fill: '#0891b2',
    softFill: '#ecfeff',
    hoverFill: '#cffafe',
    selectedFill: '#a5f3fc',
    stroke: '#a5f3fc',
    text: '#164e63',
    mutedText: '#06b6d4',
    badgeFill: '#cffafe',
    badgeStroke: '#67e8f9',
    badgeText: '#0891b2',
  },
  field: {
    icon: '•',
    title: '字段',
    fill: '#475569',
    softFill: '#f8fafc',
    hoverFill: '#f1f5f9',
    selectedFill: '#e2e8f0',
    stroke: '#cbd5e1',
    text: '#0f172a',
    mutedText: '#64748b',
    badgeFill: '#f1f5f9',
    badgeStroke: '#cbd5e1',
    badgeText: '#475569',
  },
}

export const DEFAULT_NODE_TYPE = 'field'

export const getNodeTypeStyle = (type: string): NodeTypeStyle =>
  NODE_TYPE_STYLES[type] ?? NODE_TYPE_STYLES[DEFAULT_NODE_TYPE]

export const getNodeFill = (type: string, selected: boolean, hovered: boolean): string => {
  const style = getNodeTypeStyle(type)
  if (selected) return style.selectedFill
  if (hovered) return style.hoverFill
  return style.softFill
}

export const getNodeStroke = (type: string, selected: boolean, hovered: boolean): string => {
  const style = getNodeTypeStyle(type)
  if (selected || hovered) return style.fill
  return style.stroke
}

export const getNodeShadow = (type: string, selected: boolean): string => {
  const style = getNodeTypeStyle(type)
  if (selected) return `${style.fill}38`
  return 'rgba(15, 23, 42, 0.08)'
}

export const getNodeLabelFill = (type: string, selected: boolean): string => {
  const style = getNodeTypeStyle(type)
  return style.text
}

export const getNodeContentFill = (type: string, selected: boolean): string => {
  const style = getNodeTypeStyle(type)
  return style.mutedText
}

export const hexToRgba = (hex: string, alpha: number): string => {
  const sanitized = hex.replace('#', '')
  const bigint = parseInt(sanitized, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
