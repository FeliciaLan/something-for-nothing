<template>
  <main class="app">
    <aside class="sidebar">
      <section class="panel">
        <div class="panel-title">
          <h2>列配置</h2>
          <button class="primary" type="button" @click="addColumn">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
            新增列
          </button>
        </div>
        <div class="column-list">
          <article
            v-for="column in orderedColumns"
            :key="column.id"
            class="column-item"
            :class="{ muted: !column.visible }"
          >
            <div class="column-item-header">
              <span
                class="column-type-dot"
                :style="{ background: getNodeTypeStyle(column.type).fill }"
                :title="column.type"
              />
              <div>
                <strong>{{ column.title }}</strong>
                <small>{{ column.type }}</small>
              </div>
            </div>
            <div class="button-row">
              <div class="btn-group">
                <button type="button" title="左移" @click="moveColumn(column.id, -1)">
                  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                  </svg>
                </button>
                <button type="button" title="右移" @click="moveColumn(column.id, 1)">
                  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                  </svg>
                </button>
              </div>
              <div class="btn-group">
                <button type="button" title="变窄" @click="resizeColumn(column.id, -20)">
                  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </button>
                <button type="button" title="变宽" @click="resizeColumn(column.id, 20)">
                  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12h14M12 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  </svg>
                </button>
              </div>
              <button
                v-if="column.visible"
                type="button"
                title="隐藏列"
                @click="hideColumn(column.id)"
              >
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </svg>
              </button>
              <button v-else type="button" title="显示列" @click="showColumn(column.id)">
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none" />
                </svg>
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>节点操作</h2>
          <span class="tag">{{ selectedNode?.label ?? '未选中' }}</span>
        </div>

        <div v-if="!selectedNode" class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          在画布中点击节点以编辑
        </div>

        <template v-else>
          <div class="panel-section">
            <span class="panel-section-title">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              基本信息
            </span>
            <label>
              节点名称
              <input v-model="draftLabel" type="text" />
            </label>
            <label>
              节点类型
              <select v-model="draftType">
                <option v-for="column in orderedColumns" :key="column.id" :value="column.type">
                  {{ column.title }} / {{ column.type }}
                </option>
              </select>
            </label>
          </div>

          <div class="panel-section">
            <span class="panel-section-title">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
              节点内容
            </span>
            <label>
              内容说明
              <textarea v-model="draftContent" rows="4" />
            </label>
          </div>

          <div class="panel-section">
            <span class="panel-section-title">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2v20M2 12h20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
              操作
            </span>
            <div class="button-grid">
              <button class="primary" type="button" :disabled="!selectedNode" @click="renameSelected">
                更新节点
              </button>
              <button type="button" :disabled="!selectedNode" @click="addChild">
                新增子节点
              </button>
              <button type="button" :disabled="!selectedNode" @click="toggleSelected">
                展开/折叠
              </button>
            </div>
          </div>

          <div class="panel-section">
            <span class="panel-section-title">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
              危险操作
            </span>
            <div class="button-grid">
              <button class="danger" type="button" :disabled="!selectedNode || isSelectedRoot" @click="removeSelected">
                删除子树
              </button>
              <button class="danger" type="button" :disabled="!selectedNode || isSelectedRoot" @click="removeSelectedPath">
                删除路径
              </button>
            </div>
          </div>

          <div class="panel-section">
            <span class="panel-section-title">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 9l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              移动节点
            </span>
            <label>
              目标父节点
              <select v-model="targetParentId">
                <option v-for="node in parentCandidates" :key="node.id" :value="node.id">
                  {{ node.label }}
                </option>
              </select>
              <small v-if="parentCandidateOverflow" class="field-note">
                仅显示前 200 个候选父节点，请先折叠或选中附近节点后再移动。
              </small>
            </label>
            <button type="button" :disabled="!selectedNode" @click="moveSelected">
              移动节点
            </button>
          </div>

          <div class="panel-section">
            <p class="field-note">
              快捷键：
              <kbd class="kbd">Space</kbd> 展开/折叠，
              <kbd class="kbd">Delete</kbd> 删除路径，
              <kbd class="kbd">Esc</kbd> 取消选择
            </p>
          </div>
        </template>
      </section>

      <section class="panel compact">
        <h2>当前规模</h2>
        <dl>
          <div class="stat-card--total">
            <dt>总节点</dt>
            <dd>{{ stats.totalNodes }}</dd>
          </div>
          <div class="stat-card--visible">
            <dt>可见节点</dt>
            <dd>{{ stats.visibleNodes }}</dd>
          </div>
          <div class="stat-card--edges">
            <dt>可见边</dt>
            <dd>{{ stats.visibleEdges }}</dd>
          </div>
        </dl>
      </section>
    </aside>

    <section class="workspace">
      <div class="toolbar">
        <div class="toolbar-brand">
          <h1>类表格树结构编辑器</h1>
          <p>父子关系独立保存，横向位置始终按照当前列顺序重新排列。</p>
        </div>
        <div class="toolbar-actions">
          <div class="toolbar-group">
            <label>布局</label>
            <div class="segmented-control" aria-label="布局模式">
              <button
                type="button"
                :class="{ active: layoutMode === 'table' }"
                @click="layoutMode = 'table'"
              >
                列式布局
              </button>
              <button
                type="button"
                :class="{ active: layoutMode === 'ecological' }"
                @click="layoutMode = 'ecological'"
              >
                生态树辅助
              </button>
            </div>
          </div>

          <div class="toolbar-group">
            <button class="toolbar-btn" type="button" :disabled="isExporting" title="导出图片 (Ctrl/Cmd + E)" @click="exportImage">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                <polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {{ isExporting ? '导出中...' : '导出图片' }}
            </button>
            <button class="toolbar-btn" type="button" title="生成 2000 节点样例 (Ctrl/Cmd + G)" @click="generateLargeData">
              <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2" fill="none" />
                <path d="M3 9h18M9 21V9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              生成 2000 节点样例
            </button>
          </div>
        </div>
      </div>

      <TableTreeGraph
        :layout="layout"
        :columns="store.columns"
        :selected-node-id="store.selectedNodeId"
        @node-click="selectNode"
        @node-double-click="toggleNode"
        @column-resize="setColumnWidth"
      />
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, shallowRef, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import TableTreeGraph from './components/TableTreeGraph.vue'
import { downloadTableTreeImage } from './graph/exportImage'
import { buildTableTreeLayout } from './graph/layout'
import { tableTreeCommands } from './graph/treeCommands'
import { getVisibleNodes, getVisibleStats } from './graph/visible'
import { createInitialStore } from './mock/table-tree-data'
import { getNodeTypeStyle } from './graph/style'
import type { TableTreeLayoutMode, TableTreeStore } from './types/table-tree'

const store = shallowRef<TableTreeStore>(createInitialStore())
const draftLabel = ref('')
const draftContent = ref('')
const draftType = ref('domain')
const targetParentId = ref('')
const layoutMode = ref<TableTreeLayoutMode>('table')
const isExporting = ref(false)
const MAX_VISIBLE_RENDER_NODES = 700

const orderedColumns = computed(() => store.value.columns.slice().sort((a, b) => a.order - b.order))
const selectedNode = computed(() => (store.value.selectedNodeId ? store.value.nodesById[store.value.selectedNodeId] : undefined))
const isSelectedRoot = computed(() => Boolean(selectedNode.value && store.value.rootIds.includes(selectedNode.value.id)))
const layout = computed(() => buildTableTreeLayout(store.value, layoutMode.value))
const stats = computed(() => getVisibleStats(store.value))
const visibleNodeIds = computed(() => new Set(getVisibleNodes(store.value).map((node) => node.id)))
const allParentCandidates = computed(() =>
  Object.values(store.value.nodesById)
    .filter((node) => node.id !== store.value.selectedNodeId)
    .filter((node) => visibleNodeIds.value.has(node.id) || node.id === selectedNode.value?.parentId)
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')),
)
const parentCandidates = computed(() => allParentCandidates.value.slice(0, 200))
const parentCandidateOverflow = computed(() => allParentCandidates.value.length > parentCandidates.value.length)

watch(
  selectedNode,
  (node) => {
    draftLabel.value = node?.label ?? ''
    draftContent.value = node?.content ?? ''
    draftType.value = node?.type ?? orderedColumns.value[0]?.type ?? ''
    targetParentId.value = node?.parentId ?? store.value.rootIds[0] ?? ''
  },
  { immediate: true },
)

const apply = (next: TableTreeStore) => {
  store.value = next
}

const addColumn = () => apply(tableTreeCommands.addColumn(store.value, `新列${store.value.columns.length + 1}`))
const hideColumn = (columnId: string) => apply(tableTreeCommands.removeColumn(store.value, columnId))
const showColumn = (columnId: string) => apply(tableTreeCommands.restoreColumn(store.value, columnId))
const moveColumn = (columnId: string, direction: -1 | 1) => apply(tableTreeCommands.moveColumn(store.value, columnId, direction))
const resizeColumn = (columnId: string, delta: number) => {
  const column = store.value.columns.find((item) => item.id === columnId)
  if (column) setColumnWidth(columnId, column.width + delta)
}

const setColumnWidth = (columnId: string, width: number) => {
  apply(tableTreeCommands.updateColumnWidth(store.value, columnId, width))
}

const selectNode = (nodeId: string) => apply(tableTreeCommands.selectNode(store.value, nodeId))
const countExpandedSubtree = (nodeId: string): number => {
  const node = store.value.nodesById[nodeId]
  if (!node) return 0
  return 1 + node.childrenIds.reduce((sum, childId) => sum + countExpandedSubtree(childId), 0)
}

const toggleNode = (nodeId: string) => {
  const node = store.value.nodesById[nodeId]
  if (!node) return

  if (node.collapsed) {
    const currentVisible = stats.value.visibleNodes
    const addedNodes = Math.max(countExpandedSubtree(nodeId) - 1, 0)
    if (currentVisible + addedNodes > MAX_VISIBLE_RENDER_NODES) {
      window.alert(`本次展开后可见节点约 ${currentVisible + addedNodes} 个，已超过当前渲染保护阈值 ${MAX_VISIBLE_RENDER_NODES}。请先折叠其它分支。`)
      return
    }
  }

  apply(tableTreeCommands.toggleCollapse(store.value, nodeId))
}
const toggleSelected = () => selectedNode.value && toggleNode(selectedNode.value.id)
const deselect = () => apply({ ...store.value, selectedNodeId: undefined })

const renameSelected = () => {
  if (!selectedNode.value) return
  let next = tableTreeCommands.updateNodeLabel(store.value, selectedNode.value.id, draftLabel.value)
  next = tableTreeCommands.updateNodeType(next, selectedNode.value.id, draftType.value)
  next = tableTreeCommands.updateNodeContent(next, selectedNode.value.id, draftContent.value)
  apply(next)
}

const addChild = () => {
  if (!selectedNode.value) return
  apply(
    tableTreeCommands.addNode(store.value, selectedNode.value.id, {
      type: draftType.value,
      label: `${draftLabel.value || '新节点'} 子项`,
      content: draftContent.value,
    }),
  )
}

const removeSelected = () => {
  if (!selectedNode.value) return
  apply(tableTreeCommands.removeNode(store.value, selectedNode.value.id))
}

const removeSelectedPath = () => {
  if (!selectedNode.value) return
  apply(tableTreeCommands.removePath(store.value, selectedNode.value.id))
}

const moveSelected = () => {
  if (!selectedNode.value) return
  apply(tableTreeCommands.moveNode(store.value, selectedNode.value.id, targetParentId.value || undefined))
}

const exportImage = async () => {
  if (isExporting.value) return
  isExporting.value = true
  try {
    await downloadTableTreeImage(layout.value, store.value.selectedNodeId)
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '图片导出失败。')
  } finally {
    isExporting.value = false
  }
}

const generateLargeData = () => {
  const next = createInitialStore()
  let fieldCounter = 0

  next.rootIds = ['bulk-root']
  next.nodesById = {
    'bulk-root': {
      id: 'bulk-root',
      type: 'domain',
      label: '大数据量根节点',
      content: '单棵树根节点',
      childrenIds: [],
      collapsed: false,
    },
  }

  for (let systemIndex = 0; systemIndex < 9; systemIndex += 1) {
    const systemId = `bulk-system-${systemIndex}`
    next.nodesById['bulk-root'].childrenIds.push(systemId)
    next.nodesById[systemId] = {
      id: systemId,
      parentId: 'bulk-root',
      type: 'system',
      label: `系统 ${systemIndex + 1}`,
      content: `系统分组 ${systemIndex + 1}`,
      childrenIds: [],
      collapsed: true,
    }

    for (let moduleIndex = 0; moduleIndex < 5; moduleIndex += 1) {
      const moduleId = `bulk-module-${systemIndex}-${moduleIndex}`
      next.nodesById[systemId].childrenIds.push(moduleId)
      next.nodesById[moduleId] = {
        id: moduleId,
        parentId: systemId,
        type: 'module',
        label: `模块 ${systemIndex + 1}-${moduleIndex + 1}`,
        content: '模块层节点',
        childrenIds: [],
      }

      for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
        const pageId = `bulk-page-${systemIndex}-${moduleIndex}-${pageIndex}`
        next.nodesById[moduleId].childrenIds.push(pageId)
        next.nodesById[pageId] = {
          id: pageId,
          parentId: moduleId,
          type: 'page',
          label: `页面 ${systemIndex + 1}-${moduleIndex + 1}-${pageIndex + 1}`,
          content: '页面层节点',
          childrenIds: [],
        }

        for (let apiIndex = 0; apiIndex < 3; apiIndex += 1) {
          const apiId = `bulk-api-${systemIndex}-${moduleIndex}-${pageIndex}-${apiIndex}`
          next.nodesById[pageId].childrenIds.push(apiId)
          next.nodesById[apiId] = {
            id: apiId,
            parentId: pageId,
            type: 'api',
            label: `接口 ${systemIndex + 1}-${moduleIndex + 1}-${pageIndex + 1}-${apiIndex + 1}`,
            content: '接口层节点',
            childrenIds: [],
          }

          const fieldCount = fieldCounter < 145 ? 3 : 2
          for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex += 1) {
            const fieldId = `bulk-field-${fieldCounter}-${fieldIndex}`
            next.nodesById[apiId].childrenIds.push(fieldId)
            next.nodesById[fieldId] = {
              id: fieldId,
              parentId: apiId,
              type: 'field',
              label: `字段 ${fieldCounter + 1}-${fieldIndex + 1}`,
              content: `字段说明 ${fieldCounter + 1}-${fieldIndex + 1}`,
              childrenIds: [],
            }
          }
          fieldCounter += 1
        }
      }
    }
  }

  next.selectedNodeId = 'bulk-root'
  apply(next)
}

const isTypingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable
}

const onKeyDown = (event: KeyboardEvent) => {
  if (isTypingTarget(event.target)) return

  const isMeta = event.ctrlKey || event.metaKey

  if (event.key === 'Escape') {
    event.preventDefault()
    deselect()
    return
  }

  if (event.key === ' ' && selectedNode.value) {
    event.preventDefault()
    toggleSelected()
    return
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNode.value && !isSelectedRoot.value) {
    event.preventDefault()
    removeSelectedPath()
    return
  }

  if (isMeta && event.key.toLowerCase() === 'e') {
    event.preventDefault()
    exportImage()
    return
  }

  if (isMeta && event.key.toLowerCase() === 'g') {
    event.preventDefault()
    generateLargeData()
    return
  }

  if (isMeta && event.key === '1') {
    event.preventDefault()
    layoutMode.value = 'table'
    return
  }

  if (isMeta && event.key === '2') {
    event.preventDefault()
    layoutMode.value = 'ecological'
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>
