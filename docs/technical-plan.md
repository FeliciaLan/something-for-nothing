# 类表格树 G6 技术方案

## 1. 需求理解

本项目要实现的是一种“类表格的树结构”。

它同时具备两套语义：

- 树语义：节点之间存在父子关系，支持展开、折叠、新增、删除、移动、删除路径等树操作。
- 表格语义：节点有类型，类型对应表格列，节点必须按照当前列顺序横向排列。

因此，树的父子关系和视觉列顺序必须解耦：

```text
父子关系决定数据结构
列配置决定横向位置
展开状态决定当前可见节点
布局算法决定节点纵向位置和连线方式
```

节点路径中的类型顺序可以和列顺序不一致，但渲染时始终按照列顺序排列。同一条路径上同一类型原则上只应出现一次，否则多个节点会落到同一列，编辑和视觉语义都会变复杂。

## 2. 技术选型

当前实现采用：

- Vue 3
- TypeScript
- Vite
- AntV G6 5.x

G6 不直接使用默认 TreeGraph 布局，而是使用普通 Graph + 自定义坐标布局。

原因是默认树布局通常按照树深度决定横向位置，而本需求要求：

```text
x = 列位置
y = 树展开后的行位置
```

所以核心布局必须由业务代码控制，G6 只负责图形渲染、画布拖拽、缩放、节点点击等交互。

## 3. 核心数据模型

### 3.1 列模型

列是独立配置，不属于树节点本身：

```ts
interface TableTreeColumn {
  id: string
  type: string
  title: string
  width: number
  visible: boolean
  order: number
}
```

列支持：

- 新增
- 隐藏 / 显示
- 左右移动
- 调整宽度

列的 `type` 决定同类型节点所在的横向列。

### 3.2 树模型

树使用 normalized store，而不是递归 children 对象：

```ts
interface TableTreeNode {
  id: string
  type: string
  label: string
  content?: string
  parentId?: string
  childrenIds: string[]
  collapsed?: boolean
}

interface TableTreeStore {
  rootIds: string[]
  nodesById: Record<string, TableTreeNode>
  columns: TableTreeColumn[]
  selectedNodeId?: string
}
```

这样做的原因：

- 新增、删除、移动节点更方便。
- 大数据量下避免深层递归对象频繁复制。
- 更容易做局部更新、懒加载、服务端同步。
- 方便后续支持 undo / redo。

当前约束是图上只有一棵树，因此 `rootIds` 实际只保留一个根节点。

## 4. 布局方案

布局分成三步：

### 4.1 计算可见节点

根据 `collapsed` 状态，只收集当前展开路径上的节点。

```text
全量数据 != 全量渲染数据
```

大数据量时，内存里可以有 2000、10000 甚至更多节点，但 G6 只接收当前可见节点。

### 4.2 按列计算横坐标

节点宽度和对应表头列宽保持一致。

```text
node.width = column.width
node.x = columnStart + column.width / 2
```

这样节点不会移出列范围。当前实现也禁用了节点拖拽，只允许画布拖拽和缩放。

### 4.3 按树结构计算纵坐标

纵向采用树布局常见策略：

- 叶子节点依次占行。
- 父节点 y 坐标取子节点 y 坐标的中点。
- 同列节点额外做防重叠处理，保证节点之间有最小间距。

这样可以避免同一列节点互相遮挡。

## 5. 表头锁定方案

表头不作为 G6 节点渲染，而是使用固定 DOM overlay 渲染在图区域顶部。

原因是：

- 如果表头是 G6 节点，它会跟着画布上下拖拽。
- 需求要求类似表格的“锁定列头”，树可以上下拖拽，但表头必须固定在顶部。

当前方案：

```text
G6 渲染树节点和边
DOM overlay 渲染表头
表头读取 G6 viewport transform，同步横向位置和缩放后的列宽
```

树画布从表头下方开始，表头层带背景遮罩和边界，因此节点和连线不会遮挡表头。

### 5.1 表头和节点同步方案

表头虽然不是 G6 节点，但它必须和 G6 里的节点保持同一套列位置、列宽和缩放比例。

同步的核心原则是：

```text
布局层给出画布坐标
G6 负责画布坐标到视口坐标的转换
DOM 表头使用转换后的视口坐标渲染
```

布局层会为每一列生成 `columnHeaders`：

```ts
{
  id: 'column-header-col-system',
  type: 'system',
  title: '系统',
  x: columnStart + column.width / 2,
  y: 36,
  width: column.width,
  height: HEADER_HEIGHT
}
```

树节点也使用同一份列配置计算：

```text
node.width = column.width
node.x = columnStart + column.width / 2
```

因此在画布坐标系里，表头和节点天然对齐。

### 5.2 为什么表头不用 G6 节点

如果表头作为 G6 节点渲染，它会进入 G6 的主画布层。

这样会出现两个问题：

- 拖动画布时，表头会跟着树一起上下移动，无法实现锁定列头。
- 表头和树节点在同一渲染层里，树节点可能拖到或缩放到表头区域，产生遮挡。

所以当前设计把表头拆成 DOM overlay：

```text
.graph-shell
  .graph-header        固定表头层
  .graph-container     G6 树画布层
```

其中 `.graph-container` 从表头下方开始：

```css
.graph-container {
  position: absolute;
  top: 58px;
  left: 0;
  right: 0;
  bottom: 0;
}
```

这保证了 G6 的树节点和边不会绘制到表头区域。

### 5.3 横向拖拽同步

G6 拖动画布时，树节点的位置变化发生在 viewport transform 中。DOM 表头需要把列头的画布坐标转换成当前视口坐标。

当前实现使用 G6 API：

```ts
const [left] = graph.getViewportByCanvas([header.x - header.width / 2, 0])
```

这里传入的是列头左边界的画布坐标：

```text
header.x - header.width / 2
```

返回值 `left` 是当前视口中的 DOM 横坐标。表头 DOM 使用这个值设置：

```vue
<div
  class="graph-column-header"
  :style="{
    transform: `translateX(${header.left}px)`,
    width: `${header.width}px`
  }"
/>
```

因此，用户左右拖动画布时：

```text
G6 节点横向移动
DOM 表头横向移动
二者保持列对齐
```

### 5.4 缩放同步

G6 缩放后，节点和边都会按当前 zoom 缩放。

表头 DOM 需要同步列宽：

```ts
const zoom = graph.getZoom()
width = header.width * zoom
```

也就是说：

```text
画布内节点宽度 = column.width * zoom
DOM 表头宽度 = column.width * zoom
```

这样缩放时，表头和节点的宽度始终一致。

### 5.5 事件同步时机

表头同步不是每帧轮询，而是在关键事件后触发：

- `aftertransform`：G6 viewport 变换后。
- `canvas:drag`：拖动画布时。
- `canvas:wheel`：滚轮缩放时。
- `ResizeObserver`：图容器尺寸变化时。
- 数据重新渲染后：列宽、列顺序、可见节点变化后。

同步函数会通过 `requestAnimationFrame` 合并高频事件：

```ts
const scheduleHeaderSync = () => {
  if (syncFrame) cancelAnimationFrame(syncFrame)
  syncFrame = requestAnimationFrame(syncHeader)
}
```

这样可以减少拖拽和缩放期间的 DOM 更新次数。

### 5.6 遮挡处理

遮挡通过三层策略处理：

1. 表头层固定在 `.graph-shell` 顶部，`z-index` 高于 G6 画布。
2. G6 容器从 `top: 58px` 开始，树节点和边不会画到表头区域。
3. 表头层有不透明背景、边框和阴影，即使画布内部有内容贴近顶部，也不会视觉穿透。

对应样式：

```css
.graph-header {
  position: absolute;
  z-index: 4;
  top: 0;
  left: 0;
  right: 0;
  height: 58px;
  overflow: hidden;
  background: rgba(248, 250, 252, 0.96);
}
```

节点之间的遮挡由布局层处理：

```text
同列节点按 y 坐标排序
如果当前节点距离上一个节点太近，则向下推开
```

这保证：

- 表头之间不互相遮挡。
- 表头不遮挡节点。
- 节点不进入表头区域。
- 同列节点尽量不互相遮挡。

## 6. 连线方案

节点之间使用 G6 polyline 边：

- 无箭头
- 只使用横线和竖线
- 支持折线拐弯
- 父子列顺序反向时使用虚线或特殊颜色提示

连线控制点由布局层计算：

```text
父节点边界点 -> 中间 x 转折点 -> 子节点边界点
```

这样连线不会变成斜线，也更接近表格树的视觉习惯。

## 7. 编辑操作方案

所有树和列操作都通过 command 层执行，不在 Vue 组件里直接改数据。

典型 command：

- `addColumn`
- `removeColumn`
- `restoreColumn`
- `moveColumn`
- `updateColumnWidth`
- `addNode`
- `removeNode`
- `removePath`
- `moveNode`
- `updateNodeType`
- `updateNodeLabel`
- `updateNodeContent`
- `toggleCollapse`
- `selectNode`

这种方式方便后续扩展：

- undo / redo
- 操作日志
- 批量操作
- 权限校验
- 服务端同步

## 8. 大数据量性能策略

当前针对 2000 节点做了几类优化。

### 8.1 Vue 状态使用 shallowRef

树 store 使用 `shallowRef`，避免 Vue 对 2000 个节点对象做深度响应式代理。

```ts
const store = shallowRef<TableTreeStore>(createInitialStore())
```

每次 command 返回新的 store 引用，从而触发视图更新。

### 8.2 全量数据和可见数据分离

2000 节点样例完整保留在 `nodesById` 中，但默认只展开到系统层。

当前样例规模：

```text
总节点: 2000
初始可见节点: 10
系统: 9
模块: 45
页面: 180
接口: 540
字段: 1225
```

这样点击生成样例时不会一次性把 2000 个节点和边全部交给 G6。

### 8.3 限制展开后的可见节点数

当前加了一个保护阈值：

```text
MAX_VISIBLE_RENDER_NODES = 700
```

如果某次展开会让可见节点超过阈值，则阻止展开并提示用户先折叠其它分支。

这不是最终的虚拟化方案，但可以避免误操作导致页面卡死。

### 8.4 父节点候选列表限量

“移动到父节点”的下拉框只显示当前可见节点中的候选项，并限制前 200 个，避免 select 一次性渲染几千个 option。

## 9. 代码文件说明

### 9.1 `src/main.ts`

应用入口文件。

职责：

- 创建 Vue 应用。
- 挂载根组件 `App.vue`。
- 引入全局样式 `styles.css`。

这个文件不包含业务逻辑。

### 9.2 `src/App.vue`

主页面组件，也是当前 Demo 的业务编排层。

职责：

- 持有 `TableTreeStore`。
- 使用 `shallowRef` 管理大树数据，避免 Vue 深度代理 2000 个节点。
- 计算当前布局 `layout`。
- 计算统计信息 `stats`。
- 渲染左侧列配置面板。
- 渲染左侧节点编辑面板。
- 调用 command 层完成列和树的编辑。
- 生成 2000 节点模拟数据。
- 控制展开保护阈值，避免一次性渲染过多节点。

重要点：

```ts
const store = shallowRef<TableTreeStore>(createInitialStore())
```

这里选择 `shallowRef` 是性能关键点。全量树数据只通过替换 store 引用触发更新，不让 Vue 对每个节点对象建立深层响应式代理。

### 9.3 `src/components/TableTreeGraph.vue`

G6 图组件。

职责：

- 初始化 G6 Graph。
- 接收布局结果 `layout`。
- 将布局结果转换成 G6 数据。
- 渲染树节点和连线。
- 渲染固定 DOM 表头。
- 监听节点点击、双击事件。
- 监听 G6 viewport 变化，同步表头位置和宽度。
- 监听容器 resize，更新 G6 画布尺寸。

这个组件是表头锁定方案的核心文件。

关键逻辑：

```ts
const [left] = graph.getViewportByCanvas([header.x - header.width / 2, 0])
const zoom = graph.getZoom()
```

前者把列头左边界从 G6 画布坐标转换成 DOM 视口坐标；后者拿到当前缩放比例，用于同步表头宽度。

### 9.4 `src/types/table-tree.ts`

类型定义文件。

职责：

- 定义列模型 `TableTreeColumn`。
- 定义树节点模型 `TableTreeNode`。
- 定义全局 store `TableTreeStore`。
- 定义可见节点 `VisibleNode`。
- 定义布局节点 `LayoutNode`。
- 定义布局表头 `LayoutColumnHeader`。
- 定义布局边 `LayoutEdge`。
- 定义布局结果 `TableTreeLayout`。

这个文件是模块之间的契约。后续如果接后端接口，也应优先对齐这里的数据模型。

### 9.5 `src/mock/table-tree-data.ts`

初始 mock 数据文件。

职责：

- 提供 `createInitialStore()`。
- 创建默认列配置。
- 创建一棵默认业务树。

当前 mock 数据满足：

- 单根树。
- 节点有类型。
- 节点有 label 和 content。
- 默认路径体现列式树结构。

### 9.6 `src/graph/treeCommands.ts`

树和列的 command 层。

职责：

- 封装所有数据变更。
- 避免 Vue 组件直接修改复杂数据结构。
- 每个操作返回新的 `TableTreeStore`。

包含的操作：

- 新增列
- 隐藏 / 显示列
- 移动列
- 调整列宽
- 新增节点
- 删除节点
- 删除路径
- 移动节点
- 修改节点类型
- 修改节点名称
- 修改节点内容
- 展开 / 折叠
- 选中节点

这个文件后续可以自然扩展 undo / redo，因为所有变更都集中在 command API。

### 9.7 `src/graph/visible.ts`

可见节点计算文件。

职责：

- 根据 `rootIds`、`childrenIds`、`collapsed` 计算当前可见节点。
- 生成 `VisibleNode[]`。
- 计算总节点、可见节点、可见边统计。

核心原则：

```text
全量树存在 store 中
G6 只渲染 visible.ts 计算出来的节点
```

这是大数据量优化的第一层。

### 9.8 `src/graph/layout.ts`

自定义布局引擎。

职责：

- 根据列顺序计算每列起始位置。
- 生成固定表头布局 `columnHeaders`。
- 计算节点 x/y/width/height。
- 计算同列节点防重叠。
- 计算边的 source/target port。
- 计算 polyline 控制点。
- 输出 `TableTreeLayout`。

这个文件决定视觉结构，而不是 G6 默认布局。

关键规则：

```text
x 由节点 type 对应的列决定
y 由当前可见树结构决定
width 等于对应列宽
```

因此节点无法脱离所属列。

### 9.9 `src/graph/g6Adapter.ts`

G6 数据适配器。

职责：

- 把业务布局结果转换成 G6 `GraphData`。
- 生成 G6 nodes。
- 生成 G6 edges。
- 写入节点样式所需的数据字段。
- 写入边的 sourcePort、targetPort、controlPoints。

注意：表头不在这里生成 G6 节点。

原因是表头需要锁定在顶部，如果作为 G6 节点会随着画布上下拖动。

### 9.10 `src/styles.css`

全局样式文件。

职责：

- 定义页面整体布局。
- 定义左侧控制面板样式。
- 定义图区域背景。
- 定义固定表头层 `.graph-header`。
- 定义表头单元格 `.graph-column-header`。
- 定义 G6 容器 `.graph-container` 从表头下方开始。

表头防遮挡主要依赖这里的样式：

```css
.graph-header {
  z-index: 4;
  height: 58px;
  overflow: hidden;
}

.graph-container {
  top: 58px;
}
```

### 9.11 `src/styles.css` 与 `TableTreeGraph.vue` 的协作关系

表头同步不是单纯 CSS 能完成的，它依赖两个部分：

- `TableTreeGraph.vue` 根据 G6 viewport 计算表头 left 和 width。
- `styles.css` 保证表头固定、裁剪、覆盖和不被节点遮挡。

如果未来修改表头高度，需要同时修改：

- `.graph-header` 的 `height`
- `.graph-container` 的 `top`
- 可能还需要调整 layout 中的 `TOP_PADDING`

### 9.12 配置文件

`package.json`：

- 定义项目依赖。
- 定义 `dev`、`build`、`preview` 脚本。

`vite.config.ts`：

- Vite 配置。
- 当前只启用 Vue 插件。

`tsconfig.json`：

- TypeScript 配置。
- 开启严格类型检查。

`index.html`：

- Vite HTML 入口。
- 提供 `#app` 挂载点。

## 10. 后续性能增强方向

如果后续需要支持 1 万、10 万级别节点，建议继续做：

1. 视口虚拟化：只把当前视口附近的节点和边交给 G6。
2. 异步展开：节点 children 按需从服务端加载。
3. 布局缓存：子树未变化时复用旧坐标。
4. 分层渲染：远距离缩小时隐藏节点内容，只显示简化块。
5. 搜索定位：只展开命中路径，而不是展开整棵树。
6. Web Worker 布局：大规模布局计算放到 worker，避免阻塞主线程。

## 11. Vue2 + G6 是否可以实现

可以实现相同效果。

核心原因是这个方案的关键不依赖 Vue 3 特性，而在于：

- normalized tree store
- 自定义列布局
- 可见节点计算
- G6 Graph 渲染
- 固定 DOM 表头同步 G6 viewport
- 大数据量下只渲染可见节点

这些能力在 Vue2 中都能实现。

不过 Vue2 实现时要注意以下差异。

### 11.1 状态管理

Vue2 的响应式系统对大对象和动态属性不如 Vue3 方便。

建议：

- 不要把完整 `nodesById` 做深度响应式。
- 可以使用普通 JS 对象保存全量树数据。
- 用一个轻量的 `version` 字段触发 Vue2 更新。

示例：

```js
data() {
  return {
    storeVersion: 0,
    store: createInitialStore()
  }
}

methods: {
  apply(nextStore) {
    this.store = nextStore
    this.storeVersion += 1
  }
}
```

如果使用 Vuex，也建议避免对超大 `nodesById` 做频繁深层 mutation。

### 11.2 动态属性

Vue2 对新增对象属性不自动响应，需要使用：

```js
this.$set(target, key, value)
```

但本项目更推荐 command 返回新对象引用，减少直接深层 mutation。

### 11.3 G6 版本选择

Vue2 可以配：

- G6 4.x
- G6 5.x

两者都可以实现，但 API 差异较大。

如果是老 Vue2 项目，G6 4.x 集成成本可能更低；如果是新功能且允许升级，G6 5.x 的能力更完整，但迁移成本更高。

### 11.4 表头锁定

Vue2 中同样可以使用 DOM overlay 表头：

```text
G6 canvas 负责树
Vue2 DOM 负责固定表头
监听 G6 缩放 / 拖拽事件
同步表头 left 和 width
```

这部分不依赖 Vue3。

### 11.5 性能注意点

Vue2 下更需要避免：

- 一次性渲染 2000 个 option
- 把 2000 节点对象放进深度 watch
- 对整棵树做递归 computed
- 每次点击都重建完整 G6 图
- 一次性展开整棵树

Vue2 版本建议保留同样策略：

```text
全量数据存在普通 store
Vue 只响应 selectedNodeId、columns、visibleNodeIds、storeVersion 等轻量状态
G6 只渲染当前可见节点
```

## 12. 结论

Vue2 + G6 可以实现相同效果。

真正决定可行性的不是 Vue2 或 Vue3，而是是否坚持这几个原则：

- 树数据、列配置、布局结果分层。
- 不把 G6 数据当业务数据源。
- 不一次性渲染全量大树。
- 表头用固定 DOM 层锁定，按 G6 viewport 同步横向缩放和平移。
- 树节点位置由布局算法控制，禁止自由拖出列范围。

如果目标是已有 Vue2 项目落地，建议优先做一个 Vue2 + G6 的最小原型，复用当前的 `types / commands / visible / layout / adapter` 思路，只替换 Vue 组件层。
