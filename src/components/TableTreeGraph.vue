<template>
  <section class="graph-shell">
    <div class="graph-header">
      <div class="graph-header-track">
        <div
          v-for="header in headerViews"
          :key="header.id"
          class="graph-column-header"
          :style="{
            transform: `translateX(${header.left}px)`,
            width: `${header.width}px`,
            borderLeftColor: header.typeColor,
          }"
        >
          <div class="graph-column-header__title">
            <span
              class="graph-column-header__type-dot"
              :style="{ background: header.typeColor }"
              :title="header.type"
            />
            <span :title="header.title">{{ header.title }}</span>
          </div>
          <small :title="`${header.type} · ${Math.round(header.sourceWidth)}px`">{{ header.type }} · {{ Math.round(header.sourceWidth) }}px</small>
          <button
            class="graph-column-resizer"
            type="button"
            aria-label="拖拽调整列宽"
            @pointerdown.stop.prevent="startColumnResize($event, header)"
          />
        </div>
      </div>
    </div>
    <div ref="containerRef" class="graph-container"></div>
  </section>
</template>

<script setup lang="ts">
import { Graph } from '@antv/g6'
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { TableTreeColumn, TableTreeLayout } from '../types/table-tree'
import { toG6Data } from '../graph/g6Adapter'
import {
  getNodeFill,
  getNodeLabelFill,
  getNodeShadow,
  getNodeStroke,
  getNodeTypeStyle,
  hexToRgba,
} from '../graph/style'

const props = defineProps<{
  layout: TableTreeLayout
  columns: TableTreeColumn[]
  selectedNodeId?: string
}>()

const emit = defineEmits<{
  nodeClick: [nodeId: string]
  nodeDoubleClick: [nodeId: string]
  nodeMove: [nodeId: string, y: number]
  columnResize: [columnId: string, width: number]
}>()

const containerRef = ref<HTMLDivElement>()
const graphRef = shallowRef<any>()
const headerViews = ref<
  Array<{
    id: string
    columnId: string
    title: string
    type: string
    typeColor: string
    left: number
    width: number
    sourceWidth: number
  }>
>([])
let resizeObserver: ResizeObserver | undefined
let syncFrame = 0
let resizeState:
  | {
      columnId: string
      startX: number
      startWidth: number
      zoom: number
      frame: number
      nextWidth: number
    }
  | undefined

const getNodeIdFromEvent = (event: any) => {
  const target = event?.target
  return target?.id ?? target?.get?.('id') ?? event?.item?.getID?.() ?? event?.item?.id
}

const isTreeNode = (nodeId: string) => !nodeId.startsWith('column-header-')
const getDatumWidth = (datum: any) => {
  const size = datum.style?.size
  return Array.isArray(size) ? Number(size[0]) : 180
}

const syncHeader = () => {
  syncFrame = 0
  const graph = graphRef.value
  if (!graph) {
    headerViews.value = props.layout.columnHeaders.map((header) => ({
      id: header.id,
      columnId: header.columnId,
      title: header.title,
      type: header.type,
      typeColor: getNodeTypeStyle(header.type).fill,
      left: header.x - header.width / 2,
      width: header.width,
      sourceWidth: header.width,
    }))
    return
  }

  const zoom = graph.getZoom?.() ?? 1
  headerViews.value = props.layout.columnHeaders.map((header) => {
    const [left] = graph.getViewportByCanvas?.([header.x - header.width / 2, 0]) ?? [header.x - header.width / 2]

    return {
      id: header.id,
      columnId: header.columnId,
      title: header.title,
      type: header.type,
      typeColor: getNodeTypeStyle(header.type).fill,
      left,
      width: header.width * zoom,
      sourceWidth: header.width,
    }
  })
}

const scheduleHeaderSync = () => {
  if (syncFrame) cancelAnimationFrame(syncFrame)
  syncFrame = requestAnimationFrame(syncHeader)
}

const emitColumnResize = () => {
  if (!resizeState) return
  resizeState.frame = 0
  emit('columnResize', resizeState.columnId, resizeState.nextWidth)
}

const onColumnResizeMove = (event: PointerEvent) => {
  if (!resizeState) return
  const delta = (event.clientX - resizeState.startX) / resizeState.zoom
  resizeState.nextWidth = Math.max(120, Math.min(420, resizeState.startWidth + delta))
  if (!resizeState.frame) resizeState.frame = requestAnimationFrame(emitColumnResize)
}

const stopColumnResize = () => {
  if (!resizeState) return
  if (resizeState.frame) cancelAnimationFrame(resizeState.frame)
  emit('columnResize', resizeState.columnId, resizeState.nextWidth)
  resizeState = undefined
  document.body.classList.remove('is-column-resizing')
  window.removeEventListener('pointermove', onColumnResizeMove)
  window.removeEventListener('pointerup', stopColumnResize)
  window.removeEventListener('pointercancel', stopColumnResize)
}

const startColumnResize = (
  event: PointerEvent,
  header: { columnId: string; sourceWidth: number },
) => {
  stopColumnResize()
  resizeState = {
    columnId: header.columnId,
    startX: event.clientX,
    startWidth: header.sourceWidth,
    zoom: graphRef.value?.getZoom?.() ?? 1,
    frame: 0,
    nextWidth: header.sourceWidth,
  }
  document.body.classList.add('is-column-resizing')
  window.addEventListener('pointermove', onColumnResizeMove)
  window.addEventListener('pointerup', stopColumnResize)
  window.addEventListener('pointercancel', stopColumnResize)
}

const renderGraph = async () => {
  if (!graphRef.value) return

  const data = toG6Data(props.layout, props.selectedNodeId)
  graphRef.value.setData?.(data)
  await graphRef.value.render?.()
  scheduleHeaderSync()
}

const finishNodeDrag = (ids: string[]) => {
  const nodeId = ids.find((id) => isTreeNode(id))
  if (!nodeId) return
  const position = graphRef.value?.getElementPosition?.(nodeId)
  const y = Array.isArray(position) ? position[1] : position?.y
  if (Number.isFinite(y)) emit('nodeMove', nodeId, y)
}

onMounted(async () => {
  if (!containerRef.value) return

  graphRef.value = new Graph({
    container: containerRef.value,
    width: containerRef.value.clientWidth,
    height: containerRef.value.clientHeight,
    data: toG6Data(props.layout, props.selectedNodeId),
    node: {
      type: 'rect',
      style: {
        radius: 8,
        fill: (datum: any) => getNodeFill(datum.data?.type, Boolean(datum.data?.selected), false),
        stroke: (datum: any) => getNodeStroke(datum.data?.type, Boolean(datum.data?.selected), false),
        lineWidth: (datum: any) => (datum.data?.selected ? 2.2 : 1.2),
        shadowColor: (datum: any) => getNodeShadow(datum.data?.type, Boolean(datum.data?.selected)),
        shadowBlur: (datum: any) => (datum.data?.selected ? 16 : 10),
        shadowOffsetY: 4,
        labelText: (datum: any) => {
          const content = datum.data?.content ? `\n${datum.data.content}` : ''
          return `${datum.data?.label ?? datum.id}${content}`
        },
        labelFill: (datum: any) => getNodeLabelFill(datum.data?.type, Boolean(datum.data?.selected)),
        labelFontSize: 13,
        labelFontWeight: 700,
        labelLineHeight: 18,
        labelTextAlign: 'left',
        labelPlacement: 'center',
        labelOffsetX: (datum: any) => -getDatumWidth(datum) / 2 + 58,
        labelWordWrap: true,
        labelMaxWidth: (datum: any) => Math.max(getDatumWidth(datum) - 112, 80),
        icon: true,
        iconText: (datum: any) => getNodeTypeStyle(datum.data?.type).icon,
        iconFill: (datum: any) => hexToRgba(getNodeTypeStyle(datum.data?.type).fill, 0.18),
        iconFontSize: 28,
        iconFontWeight: 900,
        iconX: (datum: any) => -getDatumWidth(datum) / 2 + 22,
        iconY: 0,
        badge: true,
        badges: (datum: any) => {
          const style = getNodeTypeStyle(datum.data?.type)
          const badges: any[] = [
            {
              text: style.title,
              placement: 'right-top' as const,
              offsetX: -10,
              offsetY: 8,
              backgroundFill: style.badgeFill,
              backgroundStroke: style.badgeStroke,
              fill: style.badgeText,
              fontSize: 10,
              fontWeight: 800,
              padding: [3, 6] as [number, number],
            },
          ]

          if (datum.data?.hasChildren) {
            badges.push({
              text: datum.data?.collapsed ? '▸' : '▾',
              placement: 'right' as const,
              offsetX: -8,
              offsetY: 0,
              backgroundFill: style.badgeFill,
              backgroundStroke: style.badgeStroke,
              fill: style.badgeText,
              fontSize: 11,
              fontWeight: 900,
              padding: [3, 6] as [number, number],
            })
          }

          return badges
        },
        ports: [{ key: 'left', placement: 'left' }, { key: 'right', placement: 'right' }],
      },
      state: {
        hover: {
          fill: (datum: any) => getNodeFill(datum.data?.type, Boolean(datum.data?.selected), true),
          stroke: (datum: any) => getNodeStroke(datum.data?.type, Boolean(datum.data?.selected), true),
          lineWidth: 1.8,
          shadowBlur: 14,
        },
      },
    },
    edge: {
      type: 'polyline',
      style: {
        stroke: (datum: any) => (datum.data?.reversed ? '#f97316' : '#94a3b8'),
        lineWidth: 1.35,
        opacity: 0.9,
        lineDash: (datum: any) => (datum.data?.reversed ? [5, 4] : undefined),
        endArrow: false,
        radius: 10,
        router: {
          type: 'orth',
          offset: 18,
        },
      },
    },
    behaviors: [
      {
        type: 'drag-canvas',
        enable: (event: any) => event?.targetType === 'canvas',
      },
      'zoom-canvas',
      {
        type: 'drag-element',
        dropEffect: 'none',
        hideEdge: 'none',
        shadow: false,
        enable: (event: any) => event?.targetType === 'node' && isTreeNode(getNodeIdFromEvent(event) ?? ''),
        cursor: {
          grab: 'grab',
          grabbing: 'grabbing',
        },
        onFinish: finishNodeDrag,
      },
    ],
  })

  graphRef.value.on?.('node:click', (event: any) => {
    const nodeId = getNodeIdFromEvent(event)
    if (nodeId && isTreeNode(nodeId)) emit('nodeClick', nodeId)
  })

  graphRef.value.on?.('node:dblclick', (event: any) => {
    const nodeId = getNodeIdFromEvent(event)
    if (nodeId && isTreeNode(nodeId)) emit('nodeDoubleClick', nodeId)
  })

  graphRef.value.on?.('node:mouseenter', (event: any) => {
    const nodeId = getNodeIdFromEvent(event)
    if (nodeId && isTreeNode(nodeId)) void graphRef.value?.setElementState?.(nodeId, 'hover')
  })

  graphRef.value.on?.('node:mouseleave', (event: any) => {
    const nodeId = getNodeIdFromEvent(event)
    if (nodeId && isTreeNode(nodeId)) void graphRef.value?.setElementState?.(nodeId, [])
  })

  graphRef.value.on?.('aftertransform', scheduleHeaderSync)
  graphRef.value.on?.('canvas:drag', scheduleHeaderSync)
  graphRef.value.on?.('canvas:wheel', scheduleHeaderSync)

  resizeObserver = new ResizeObserver(() => {
    if (!containerRef.value || !graphRef.value) return
    graphRef.value.setSize?.(containerRef.value.clientWidth, containerRef.value.clientHeight)
    scheduleHeaderSync()
  })
  resizeObserver.observe(containerRef.value)

  await graphRef.value.render?.()
  scheduleHeaderSync()
})

watch(
  () => [props.layout, props.selectedNodeId],
  () => {
    void renderGraph()
  },
  { deep: false },
)

onBeforeUnmount(() => {
  stopColumnResize()
  if (syncFrame) cancelAnimationFrame(syncFrame)
  resizeObserver?.disconnect()
  graphRef.value?.off?.('aftertransform', scheduleHeaderSync)
  graphRef.value?.off?.('canvas:drag', scheduleHeaderSync)
  graphRef.value?.off?.('canvas:wheel', scheduleHeaderSync)
  graphRef.value?.off?.('node:mouseenter')
  graphRef.value?.off?.('node:mouseleave')
  graphRef.value?.destroy?.()
})
</script>
