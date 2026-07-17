# 索引页性能、动效与响应式优化设计

## 目标

在保留 Vanta NET 动态背景和演示文稿缩略图的前提下，缩短索引页首次可见时间，消除移动端滚动时卡片闪烁，并让桌面、平板和手机获得稳定的卡片布局。

## 根因

- 页面首屏同步加载 Lenis、Three.js、Vanta、GSAP、ScrollTrigger、Vanilla Tilt 和两套远程字体。
- 卡片同时使用 `backdrop-filter`、3D `preserve-3d/translateZ`、Tilt glare 和 GSAP transform；移动滚动时会持续重建半透明合成层。
- ScrollTrigger 的 `reverse` 会让卡片在上下滑动时反复进入隐藏状态。
- 所有 PNG 缩略图都立即请求，且图片没有明确尺寸、解码策略或加载优先级。

## 设计

### 依赖与首屏

- 保留 Three.js r134 和 Vanta NET，并保持 Three.js 在 Vanta 前加载。
- 两个背景脚本不参与首屏文档加载；页面完成首次渲染后，通过空闲回调依次动态加载 Three.js 和 Vanta，再初始化动画。CSS 背景在此之前提供完整兜底。
- 移除 Lenis、GSAP、ScrollTrigger、Vanilla Tilt、自定义光标和 Google Fonts 请求。
- 页面离开时调用 Vanta 实例的 `destroy()` 释放资源。

### 卡片与动画

- 使用原生滚动，不再插值滚轮输入。
- 使用 `IntersectionObserver` 为卡片添加 `.is-visible`，动画完成后立即 `unobserve()`，每张卡片只播放一次。
- 动画采用用户选择的 A 方案：`opacity: 0; transform: translateY(18px)` 到稳定状态，时长 560ms，使用快速减速曲线。
- 桌面精细指针设备只保留轻微上移、边框和图片缩放；不再使用 3D tilt、glare、灰度滤镜或反光扫光。
- `prefers-reduced-motion` 下所有内容立即可见且无位移动画。

### 半透明表面

- 桌面端使用更轻的 `backdrop-filter: blur(8px)`。
- 触屏和窄屏设备关闭 `backdrop-filter`，改用不透明度更高的深色表面，保持玻璃感但避免滚动合成闪烁。
- 卡片不再使用 `transform-style: preserve-3d`，内部元素不再使用 `translateZ`。

### 图片与响应式

- 卡片缩略图保持 16:9，不变形并提前占位。
- 第一张图使用 `loading="eager" fetchpriority="high"`；第二、三张图 eager 加载；其余图片使用 `loading="lazy" fetchpriority="low"`；全部使用 `decoding="async"` 和明确尺寸。
- 大于等于 1100px 为三列，680px 到 1099px 为两列，小于 680px 为单列。
- 移动端缩小页面留白、标题和卡片内边距，路由文本允许省略，保证无横向溢出。

## 验收标准

- 索引页不再加载 Lenis、GSAP、ScrollTrigger、Vanilla Tilt 或 Google Fonts。
- Vanta 背景仍显示并能正确销毁。
- 卡片滚动入场只播放一次，移动端没有实时 backdrop blur 或 3D 卡片效果。
- 图片仍显示，非首屏图片懒加载且页面无图片尺寸导致的布局跳动。
- 1440px、768px、390px 视口分别显示 3、2、1 列，页面无横向溢出。
- 构建、自动化测试和浏览器验证通过。
