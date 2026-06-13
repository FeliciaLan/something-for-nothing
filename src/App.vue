<template>
  <main class="app">
    <aside class="sidebar">
      <section class="panel">
        <div class="panel-title">
          <h2>列配置</h2>
          <button class="primary" type="button" @click="addColumn">新增列</button>
        </div>
        <div class="column-list">
          <article v-for="column in orderedColumns" :key="column.id" class="column-item" :class="{ muted: !column.visible }">
            <div>
              <strong>{{ column.title }}</strong>
              <small>{{ column.type }}</small>
            </div>
            <div class="button-row">
              <button type="button" @click="moveColumn(column.id, -1)">←</button>
              <button type="button" @click="moveColumn(column.id, 1)">→</button>
              <button type="button" @click="resizeColumn(column.id, -20)">窄</button>
              <button type="button" @click="resizeColumn(column.id, 20)">宽</button>
              <button v-if="column.visible" type="button" @click="hideColumn(column.id)">隐藏</button>
              <button v-else type="button" @click="showColumn(column.id)">显示</button>
            </div>
          </article>
        </div>
      </section>

      <section class="panel">
        <div class="panel-title">
          <h2>节点操作</h2>
          <span class="tag">{{ selectedNode?.label ?? '未选中' }}</span>
        </div>

        <label>
          节点名称
          <input v-model="draftLabel" type="text" />
        </label>

        <label>
          节点内容
          <textarea v-model="draftContent" rows="4"></textarea>
        </label>

        <label>
          节点类型
          <select v-model="draftType">
            <option v-for="column in orderedColumns" :key="column.id" :value="column.type">
              {{ column.title }} / {{ column.type }}
            </option>
          </select>
        </label>

        <div class="button-grid">
          <button class="primary" type="button" :disabled="!selectedNode" @click="renameSelected">更新节点</button>
          <button type="button" :disabled="!selectedNode" @click="addChild">新增子节点</button>
          <button type="button" :disabled="!selectedNode" @click="toggleSelected">展开/折叠</button>
          <button class="danger" type="button" :disabled="!selectedNode || isSelectedRoot" @click="removeSelected">删除子树</button>
          <button class="danger" type="button" :disabled="!selectedNode || isSelectedRoot" @click="removeSelectedPath">删除路径</button>
        </div>

        <label>
          移动到父节点
          <select v-model="targetParentId">
            <option v-for="node in parentCandidates" :key="node.id" :value="node.id">
              {{ node.label }}
            </option>
          </select>
          <small v-if="parentCandidateOverflow" class="field-note">仅显示前 200 个候选父节点，请先折叠或选中附近节点后再移动。</small>
        </label>
        <button type="button" :disabled="!selectedNode" @click="moveSelected">移动节点</button>
      </section>

      <section class="panel compact">
        <h2>当前规模</h2>
        <dl>
          <div>
            <dt>总节点</dt>
            <dd>{{ stats.totalNodes }}</dd>
          </div>
          <div>
            <dt>可见节点</dt>
            <dd>{{ stats.visibleNodes }}</dd>
          </div>
          <div>
            <dt>可见边</dt>
            <dd>{{ stats.visibleEdges }}</dd>
          </div>
        </dl>
      </section>
    </aside>

    <section class="workspace">
      <div class="toolbar">
        <div>
          <h1>类表格树结构编辑器</h1>
          <p>父子关系独立保存，横向位置始终按照当前列顺序重新排列。</p>
        </div>
        <button type="button" @click="generateLargeData">生成 2000 节点样例</button>
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
import { computed, shallowRef, ref, watch } from 'vue'
import TableTreeGraph from './components/TableTreeGraph.vue'
import { buildTableTreeLayout } from './graph/layout'
import { tableTreeCommands } from './graph/treeCommands'
import { getVisibleNodes, getVisibleStats } from './graph/visible'
import { createInitialStore } from './mock/table-tree-data'
import type { TableTreeStore } from './types/table-tree'

const store = shallowRef<TableTreeStore>(createInitialStore())
const draftLabel = ref('')
const draftContent = ref('')
const draftType = ref('domain')
const targetParentId = ref('')
const MAX_VISIBLE_RENDER_NODES = 700

const orderedColumns = computed(() => store.value.columns.slice().sort((a, b) => a.order - b.order))
const selectedNode = computed(() => (store.value.selectedNodeId ? store.value.nodesById[store.value.selectedNodeId] : undefined))
const isSelectedRoot = computed(() => Boolean(selectedNode.value && store.value.rootIds.includes(selectedNode.value.id)))
const layout = computed(() => buildTableTreeLayout(store.value))
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
</script>
