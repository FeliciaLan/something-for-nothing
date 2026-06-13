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
          }"
        >
          <span>{{ header.title }}</span>
          <small>{{ header.type }} · {{ Math.round(header.sourceWidth) }}px</small>
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

const props = defineProps<{
  layout: TableTreeLayout
  columns: TableTreeColumn[]
  selectedNodeId?: string
}>()

const emit = defineEmits<{
  nodeClick: [nodeId: string]
  nodeDoubleClick: [nodeId: string]
  columnResize: [columnId: string, width: number]
}>()

const containerRef = ref<HTMLDivElement>()
const graphRef = shallowRef<any>()
const headerViews = ref<
  Array<{ id: string; columnId: string; title: string; type: string; left: number; width: number; sourceWidth: number }>
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

const syncHeader = () => {
  syncFrame = 0
  const graph = graphRef.value
  if (!graph) {
    headerViews.value = props.layout.columnHeaders.map((header) => ({
      id: header.id,
      columnId: header.columnId,
      title: header.title,
      type: header.type,
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

onMounted(async () => {
  if (!containerRef.value) return

  graphRef.value = new Graph({
    container: containerRef.value,
    width: containerRef.value.clientWidth,
    height: containerRef.value.clientHeight,
    autoFit: 'view',
    data: toG6Data(props.layout, props.selectedNodeId),
    node: {
      type: 'rect',
      style: {
        radius: 6,
        fill: (datum: any) => (datum.data?.selected ? '#0f2742' : '#ffffff'),
        stroke: (datum: any) => (datum.data?.selected ? '#1d4ed8' : '#cbd5e1'),
        lineWidth: (datum: any) => (datum.data?.selected ? 2.2 : 1),
        shadowColor: (datum: any) => (datum.data?.selected ? 'rgba(29, 78, 216, 0.22)' : 'rgba(15, 23, 42, 0.08)'),
        shadowBlur: (datum: any) => (datum.data?.selected ? 16 : 10),
        shadowOffsetY: 4,
        labelText: (datum: any) => {
          const content = datum.data?.content ? `\n${datum.data.content}` : ''
          return `${datum.data?.label ?? datum.id}${content}`
        },
        labelFill: (datum: any) => (datum.data?.selected ? '#ffffff' : '#172033'),
        labelFontSize: 13,
        labelFontWeight: 600,
        labelWordWrap: true,
        labelMaxWidth: '90%',
        badge: true,
        badgeText: (datum: any) => (datum.data?.hasChildren ? (datum.data?.collapsed ? '+' : '-') : ''),
        badgePlacement: 'right',
        badgeFill: (datum: any) => (datum.data?.selected ? '#dbeafe' : '#f8fafc'),
        badgeStroke: '#bfdbfe',
        badgeTextFill: '#1d4ed8',
        ports: [{ key: 'left', placement: 'left' }, { key: 'right', placement: 'right' }],
      },
    },
    edge: {
      type: 'polyline',
      style: {
        stroke: (datum: any) => (datum.data?.reversed ? '#f97316' : '#94a3b8'),
        lineWidth: 1.35,
        opacity: 0.82,
        lineDash: (datum: any) => (datum.data?.reversed ? [5, 4] : undefined),
        endArrow: false,
        radius: 10,
        router: {
          type: 'orth',
          offset: 18,
        },
      },
    },
    behaviors: ['drag-canvas', 'zoom-canvas'],
  })

  graphRef.value.on?.('node:click', (event: any) => {
    const nodeId = getNodeIdFromEvent(event)
    if (nodeId && isTreeNode(nodeId)) emit('nodeClick', nodeId)
  })

  graphRef.value.on?.('node:dblclick', (event: any) => {
    const nodeId = getNodeIdFromEvent(event)
    if (nodeId && isTreeNode(nodeId)) emit('nodeDoubleClick', nodeId)
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
  graphRef.value?.destroy?.()
})
</script>
