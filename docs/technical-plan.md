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

## 7. 节点视觉方案

节点不是纯文本矩形，而是按类型渲染成轻量信息卡片。

当前节点包含：

- 类型主题色
- 类型图标
- 主标题
- 内容描述
- 类型徽标
- 展开 / 折叠标记

主题配置集中在 `src/graph/style.ts`：

```ts
{
  icon: '◆',
  title: '领域',
  fill: '#1d4ed8',
  softFill: '#eff6ff',
  stroke: '#bfdbfe'
}
```

这样做的原因是页面渲染和导出渲染都需要知道同一套视觉语义：

```text
节点类型 -> 图标 / 颜色 / 文案 / 徽标样式
```

如果把样式散落在 G6 组件和导出代码里，后续业务节点变复杂后，很容易出现“页面上是 A，导出图里是 B”的漂移。

当前 G6 视图仍使用 Canvas 节点，而不是 HTML 节点。

原因是大数据量下 HTML 节点会显著增加 DOM 数量和布局成本。对 2000 节点、缩放、拖拽这类场景，Canvas 节点更稳定。

如果后续业务节点需要更复杂的 DOM 结构，可以增加两种渲染层：

1. 页面渲染器：负责 G6 自定义节点或 HTML 节点。
2. 导出绘制器：负责 Canvas / SVG / 服务端导出。

但二者仍应共享同一个主题和数据描述层。

## 8. 编辑操作方案

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
- `updateNodeManualY`

这种方式方便后续扩展：

- undo / redo
- 操作日志
- 批量操作
- 权限校验
- 服务端同步

### 8.1 节点移动方案

节点支持拖动，但不是完全自由布局。

当前约束是：

```text
x 由列决定
y 可以由用户拖动后覆盖
```

节点拖动结束后，G6 会把节点当前坐标回传给业务层。业务层只保存纵向坐标：

```ts
manualY: number
```

布局层重新计算时会优先使用：

```text
node.y = node.manualY ?? treeLayoutY
```

横向坐标仍然按列计算：

```text
node.x = columnStart + column.width / 2
```

因此，节点可以上下调整位置，但不会脱离所属列，也不会破坏“列头宽度 = 节点宽度”的约束。

导出图片同样读取 `TableTreeLayout`，所以拖动后的节点位置会被一并导出。

## 9. 大数据量性能策略

当前针对 2000 节点做了几类优化。

### 9.1 Vue 状态使用 shallowRef

树 store 使用 `shallowRef`，避免 Vue 对 2000 个节点对象做深度响应式代理。

```ts
const store = shallowRef<TableTreeStore>(createInitialStore())
```

每次 command 返回新的 store 引用，从而触发视图更新。

### 9.2 全量数据和可见数据分离

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

### 9.3 限制展开后的可见节点数

当前加了一个保护阈值：

```text
MAX_VISIBLE_RENDER_NODES = 700
```

如果某次展开会让可见节点超过阈值，则阻止展开并提示用户先折叠其它分支。

这不是最终的虚拟化方案，但可以避免误操作导致页面卡死。

### 9.4 父节点候选列表限量

“移动到父节点”的下拉框只显示当前可见节点中的候选项，并限制前 200 个，避免 select 一次性渲染几千个 option。

## 10. 图片导出方案

图片导出不能直接截取当前 G6 画布。

原因是当前界面把内容拆成了两层：

```text
DOM 表头层：固定在顶部
G6 画布层：渲染树节点和连线
```

如果只导出 G6 画布，会丢失表头；如果用浏览器截图，又只能截到当前视口，用户缩放或拖拽后无法得到完整树。

因此当前采用“离屏 Canvas 重绘”的方案：

```text
TableTreeLayout -> Canvas 2D -> PNG
```

导出时直接读取布局结果 `TableTreeLayout`，重新绘制：

- 背景
- 列背景
- 列头
- 节点
- 节点内容
- 展开 / 折叠标记
- 正向 / 反向折线连线

这样导出的图片和当前画布缩放、拖拽位置无关。

### 10.1 表头一并导出

表头在页面上是 DOM overlay，但导出时不会复用 DOM。

导出工具会读取：

```ts
layout.columnHeaders
```

然后按同一套坐标绘制列头：

```text
header.left = header.x - header.width / 2
header.width = column.width
```

节点同样来自 `layout.nodes`：

```text
node.left = node.x - node.width / 2
node.width = column.width
```

因此导出图片里的表头和节点仍然保持列宽一致、横向对齐。

### 10.2 缩放后完整导出

导出不读取 G6 当前 viewport transform。

也就是说，下面这些操作不会影响导出范围：

- 用户放大
- 用户缩小
- 用户横向拖动画布
- 用户纵向拖动画布
- 当前屏幕只显示局部树

导出范围由布局数据决定：

```text
exportWidth = layout.width + padding * 2
exportHeight = max(layout.height, 节点底部, 连线底部, 表头底部) + padding * 2
```

所以导出的是当前可见树的完整布局，而不是当前屏幕视口。

这里的“当前可见树”指：遵守当前展开 / 折叠状态后实际渲染出来的节点。已经折叠在子树里的节点不会出现在图片中。

### 10.3 导出模式

当前支持两种导出模式。

第一种是“当前可见导出”：

```text
使用当前 store
尊重当前展开 / 折叠状态
导出当前可见树的完整布局
```

第二种是“全展开导出”：

```text
复制当前 store
把所有节点 collapsed 设置为 false
重新计算 TableTreeLayout
导出全量展开后的完整布局
```

全展开导出不会修改页面当前状态。用户当前正在看的展开 / 折叠状态、选中状态、画布缩放和拖拽位置都不会被改变。

这个模式适合生成完整归档图：

```text
页面上可以只展开一部分节点
导出时临时展开所有节点
图片里包含全树结构
```

全展开导出仍然会保留节点手动移动后的 `manualY`，因为它属于业务布局数据，而不是 G6 当前 viewport 状态。

每种模式都可以导出为 PNG 或 SVG：

```text
PNG：位图，兼容性好，适合直接预览和贴图。
SVG：矢量图，适合超大树、全展开树和需要高清文字的场景。
```

2000 节点全展开时，推荐优先使用 SVG。SVG 不会因为整张图很高就把文字压糊，浏览器或设计工具可以继续缩放查看。

### 10.4 大节点量导出

浏览器 Canvas 有实际尺寸限制。不同浏览器和设备的上限不同，常见风险包括：

- 单边过长导致 Canvas 创建失败。
- 总像素过大导致内存暴涨。
- 生成 PNG 时页面短暂卡顿。

当前导出工具使用自适应倍率：

```text
scale = min(devicePixelRatio, 最大边长限制, 最大像素面积限制)
```

当前限制：

```text
MAX_EXPORT_SIDE = 32767
MAX_EXPORT_AREA = 180_000_000
```

当树特别高或特别宽时，导出工具会自动降低像素倍率，优先保证完整内容都在同一张 PNG 中。

这个策略的取舍是：

```text
优先完整性
其次清晰度
```

2000 节点全展开时，完整逻辑高度可能远超浏览器单张 Canvas 的安全高度。此时即使已经提高单图上限，导出工具仍可能需要缩小倍率，否则浏览器会创建 Canvas 失败。

因此单张 PNG 的清晰度存在上限：

```text
树越高
单张图越需要缩小
文字越容易变糊
```

如果要求 2000 节点全展开后每个节点文字仍然高清可读，优先使用 SVG；如果必须交付位图，再考虑分片 PNG 或 PDF 导出，而不是强制塞进一张超长 PNG。

如果未来需要 1 万节点以上仍然保持高清，建议增加：

1. 分片导出：按纵向切成多张 PNG。
2. PDF 导出：每一页承载一个固定高度区间。
3. SVG 导出增强：适合结构图，但外部图片、复杂 CSS 和更真实的业务组件需要额外处理。
4. 后端导出：用 Node canvas / headless browser 在服务端生成大图，避免占用用户浏览器内存。

### 10.5 复杂节点导出

当前导出不是截图，而是根据布局数据重新绘制一份完整图片。

复杂节点导出遵循同一套主题配置：

```text
src/graph/style.ts
  -> G6 节点样式
  -> Canvas 导出样式
```

导出时会绘制：

- 左侧图标块
- 类型色
- 类型胶囊
- 主标题
- 内容文本
- 展开 / 折叠标记

这保证了当前节点已经不是简单矩形导出，而是具备结构化信息的卡片导出。

后续如果节点内部出现非常复杂的结构，比如字段列表、进度条、头像、状态流转、嵌套标签，建议把导出层抽象成 painter：

```ts
interface NodeExportPainter {
  type: string
  draw(ctx, node, theme): void
}
```

这样每种业务节点可以独立维护自己的导出绘制逻辑。

## 11. 代码文件说明

### 11.1 `src/main.ts`

应用入口文件。

职责：

- 创建 Vue 应用。
- 挂载根组件 `App.vue`。
- 引入全局样式 `styles.css`。

这个文件不包含业务逻辑。

### 11.2 `src/App.vue`

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
- 触发完整图片导出。

重要点：

```ts
const store = shallowRef<TableTreeStore>(createInitialStore())
```

这里选择 `shallowRef` 是性能关键点。全量树数据只通过替换 store 引用触发更新，不让 Vue 对每个节点对象建立深层响应式代理。

### 11.3 `src/components/TableTreeGraph.vue`

G6 图组件。

职责：

- 初始化 G6 Graph。
- 接收布局结果 `layout`。
- 将布局结果转换成 G6 数据。
- 渲染树节点和连线。
- 渲染固定 DOM 表头。
- 根据节点类型主题渲染图标、颜色、徽标和文本。
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

### 11.4 `src/types/table-tree.ts`

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

### 11.5 `src/mock/table-tree-data.ts`

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

### 11.6 `src/graph/treeCommands.ts`

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

### 11.7 `src/graph/visible.ts`

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

### 11.8 `src/graph/layout.ts`

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

### 11.9 `src/graph/g6Adapter.ts`

G6 数据适配器。

职责：

- 把业务布局结果转换成 G6 `GraphData`。
- 生成 G6 nodes。
- 生成 G6 edges。
- 写入节点样式所需的数据字段。
- 写入边的 sourcePort、targetPort、controlPoints。

注意：表头不在这里生成 G6 节点。

原因是表头需要锁定在顶部，如果作为 G6 节点会随着画布上下拖动。

### 11.10 `src/graph/style.ts`

节点和列类型主题配置。

职责：

- 定义不同节点类型的图标。
- 定义不同节点类型的主题色、背景色、hover 色和选中色。
- 定义徽标色。
- 提供 G6 节点和导出绘制共用的样式 helper。

这个文件是“页面渲染”和“导出渲染”的共享视觉语义层。

### 11.11 `src/graph/exportImage.ts`

图片导出工具。

职责：

- 根据 `TableTreeLayout` 离屏绘制完整图片。
- 绘制列背景和列头。
- 绘制带图标、颜色、类型胶囊、节点内容、展开 / 折叠标记的结构化节点。
- 绘制无箭头折线连线。
- 自动计算导出范围，不受当前画布缩放和拖拽影响。
- 在大图场景下自动降低导出倍率，避免超过浏览器 Canvas 尺寸限制。
- 生成并下载 PNG 文件。

这个文件故意不依赖 G6 实例，因为导出目标是完整布局，而不是当前屏幕视口。

### 11.12 `src/styles.css`

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

### 11.13 `src/styles.css` 与 `TableTreeGraph.vue` 的协作关系

表头同步不是单纯 CSS 能完成的，它依赖两个部分：

- `TableTreeGraph.vue` 根据 G6 viewport 计算表头 left 和 width。
- `styles.css` 保证表头固定、裁剪、覆盖和不被节点遮挡。

如果未来修改表头高度，需要同时修改：

- `.graph-header` 的 `height`
- `.graph-container` 的 `top`
- 可能还需要调整 layout 中的 `TOP_PADDING`

### 11.14 配置文件

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

## 12. 后续性能增强方向

如果后续需要支持 1 万、10 万级别节点，建议继续做：

1. 视口虚拟化：只把当前视口附近的节点和边交给 G6。
2. 异步展开：节点 children 按需从服务端加载。
3. 布局缓存：子树未变化时复用旧坐标。
4. 分层渲染：远距离缩小时隐藏节点内容，只显示简化块。
5. 搜索定位：只展开命中路径，而不是展开整棵树。
6. Web Worker 布局：大规模布局计算放到 worker，避免阻塞主线程。

## 13. Vue2 + G6 是否可以实现

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

### 13.1 状态管理

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

### 13.2 动态属性

Vue2 对新增对象属性不自动响应，需要使用：

```js
this.$set(target, key, value)
```

但本项目更推荐 command 返回新对象引用，减少直接深层 mutation。

### 13.3 G6 版本选择

Vue2 可以配：

- G6 4.x
- G6 5.x

两者都可以实现，但 API 差异较大。

如果是老 Vue2 项目，G6 4.x 集成成本可能更低；如果是新功能且允许升级，G6 5.x 的能力更完整，但迁移成本更高。

### 13.4 表头锁定

Vue2 中同样可以使用 DOM overlay 表头：

```text
G6 canvas 负责树
Vue2 DOM 负责固定表头
监听 G6 缩放 / 拖拽事件
同步表头 left 和 width
```

这部分不依赖 Vue3。

### 13.5 性能注意点

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

## 14. 结论

Vue2 + G6 可以实现相同效果。

真正决定可行性的不是 Vue2 或 Vue3，而是是否坚持这几个原则：

- 树数据、列配置、布局结果分层。
- 不把 G6 数据当业务数据源。
- 不一次性渲染全量大树。
- 表头用固定 DOM 层锁定，按 G6 viewport 同步横向缩放和平移。
- 树节点位置由布局算法控制，禁止自由拖出列范围。

如果目标是已有 Vue2 项目落地，建议优先做一个 Vue2 + G6 的最小原型，复用当前的 `types / commands / visible / layout / adapter` 思路，只替换 Vue 组件层。
