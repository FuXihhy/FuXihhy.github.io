# 填写主页

**正文现在直接编辑 `content/` 中的 Markdown 文件。** 不需要新增 JSON 字段，也不需要改读取代码。保存后，正在运行的本地开发预览会自动刷新；正式构建仍用 `npm run build`。

## 日常编辑文件

| 要修改的内容 | 文件 |
| --- | --- |
| About 的个人介绍、Contact me 标题、邮箱与个人链接 | `content/about.md` |
| 个人照片 | `public/images/me.jpg`；位置和链接在 `index.html`，大小在 `src/style.css` |
| Research 的研究介绍、论文或其他文字 | `content/research.md` |
| Notes 的板块介绍、笔记标题、链接与说明 | `content/notes.md` |
| Student Seminar 的整体介绍、各次标题、日期、录像与描述 | `content/student-seminar.md` |
| Miscellany 的项目、其他内容和子标题 | `content/miscellany.md` |
| 姓名、身份、机构、02 开关/素材配置 | `content/site.json` |
| 背景、字体、宽度、间距、左右栏位置 | `src/style.css` |
| 四个主栏目和 Contents 的名称与结构 | `index.html`；增删栏目还需同步 `src/companion.ts` 的章节列表 |
| 02 的动作与交互 | `src/companion.ts`、`src/companion.css` |
| 浏览器图标 | `public/icons/02-head-*.png`、`public/favicon.ico`；声明在 `index.html` |

迁移时保留了原始 JSON 备份 `qa/markdown-before-site.json`，它只用于核对，不再控制网页。正文的 About、researchIntro、notes、studentSeminars 等旧字段已从配置删除，今后只改 Markdown 中的一份内容。

照片以 `Photo` 文字链接出现在桌面页首姓名旁；窄屏放在 About 标题旁，避免挤占顶部导航。点击后查看完整原图，首页不直接展示缩略图。换照片时替换 `public/images/me.jpg` 即可。网页使用独立副本，修改桌面 `Learning/me.jpg` 不会自动同步。

## 写正文与条目

普通文字直接写；段落之间空一行。不用写 `\n\n`、引号或逗号。可使用 **加粗**、*斜体*、列表和链接。

Notes 和 Student Seminar 的固定板块标题已经在页面上，不必在文件开头重复。文件开头、第一条 `###` 标题之前的文字就是整个板块的介绍，可以写多段、插入链接或列表。

每条笔记或 seminar 以 `###` 开头。标题可直接写成链接。标题后紧接的一整段斜体作为日期或短信息：桌面在标题右侧，手机在标题下方；没有日期则直接省略。之后的内容都是这条的说明，可以自由分段、加链接和列表。

```markdown
这里是整个 Student Seminar 板块的介绍。

也可以另起一段，放上 [完整播放列表](https://www.youtube.com/playlist?list=PLF7gJfFJdnBY)。

### [Homological Algebra — Lecture 1](https://www.youtube.com/watch?v=Ut5830WIwNM)

*Sep 13, 2026*

Chapter 1 of Weibel's book.

这里可以继续添加自己的说明。

- 一项补充
- 另一项补充

### 没有录像链接的下一次 seminar

*Nov 2026*

这里写这次的内容。
```

条目按文件里的顺序显示，不会自动排序，也不会改写你填写的日期。新增条目时复制一段 `### 标题` 及其内容，再修改即可。

Research 和 Miscellany 也允许普通段落，并可使用 `##` 添加子标题。例如：

```markdown
这里写研究介绍。

## Papers & preprints

### [论文标题](https://example.org/paper)

*2026*

这里写论文说明或作者信息。
```

Miscellany 的 `## Projects` 子标题与扫非、饭签、Overleaf Personal Tools、02 Desktop Pet 四个项目都在 `content/miscellany.md` 内，可以直接增删、改名和修改说明。02 的下载入口使用 GitHub 最新 Release 链接。

## 注释与暂时隐藏

使用 HTML 注释的写法，注释不会出现在网页上：

```markdown
<!-- 这是一条给自己看的备注。 -->

<!--
### 暂时不显示的标题

这一整块都先隐藏，想恢复时删除外面的注释标记即可。
-->
```

Research 的背景介绍现在位于 `content/research.md`，包含 Argyres-Douglas Theory 和 Derived Symmetry。可以直接修改段落，或用上面的注释语法暂时隐藏一部分。以前停用的个人研究介绍保留为历史备份，当前网页未采用：

> My current project concerns extensions of the AGT correspondence for Argyres-Douglas theories, particularly D-type and affine cases. I study irregular states, Seiberg-Witten curves, and instanton partition functions.

内容支持标准 Markdown 文本、链接、图片、引用和代码块；原始 HTML 标签按文字处理，不会作为网页代码执行。代码块或行内代码中的注释示例会保留为代码，不会被误删。

## 邮箱、文件和预览

About 下的 **Contact me:**、邮箱和个人链接都在 `content/about.md`，可以直接修改标题、增添链接或删除整段。`content/site.json` 不再提供 `email`、`links` 或任何自动补上的联系方式。

当前写法是普通 Markdown 的列表和段落，保留醒目的加粗标题以及下一行的邮件链接：

```markdown
- **Contact me:**

  [haiyanghuang23@m.fudan.edu.cn](mailto:haiyanghuang23@m.fudan.edu.cn)

  [GitHub](https://github.com/your-name)
```

标题、邮箱和每条链接之间空一行，后续段落开头保留两个空格，使它们属于同一个列表项。修改邮箱时，同时修改方括号内的显示文字和 `mailto:` 后的收件地址。上例的 GitHub 行只是增添链接的示范，当前 About 未自动添加该行。

PDF、图片等本地文件放入 `public/`。例如 `public/files/my-note.pdf` 在 Markdown 中写：

```markdown
[讲义 PDF](files/my-note.pdf)
```

URL 相对于 `public/`，不要写电脑上的绝对路径，也不必添加网站仓库名；部署到 GitHub 项目子路径时会自动补上。图片可以写 `![图片说明](assets/example.png)`。

在项目目录运行 `npm run dev` 后打开 <http://127.0.0.1:5173/>。保存这五个 Markdown 或设置文件会自动刷新预览。运行 `npm run build` 可生成 `dist/`；不要直接修改 `dist/`，下次构建会覆盖它。Markdown 在开发/构建时转换成 HTML，浏览器关闭 JavaScript 也能阅读正文。

## 保留的排版

淡米白背景、680px 居中正文、左侧无编号 Contents、右侧 Q 版 02、16px/1.5 正文字体及现有紧凑间距。窄屏正文随可用宽度缩小。Notes 保持项目符号，Student Seminar 保持标题、日期、说明层级及条目分隔。四个主板块仍为 About、Research、Notes & Student Seminar、Miscellany。

## 初始内容来源记录（历史）

- 来源：用户提供的 `/Users/fuxi/Downloads/CV_Haiyang_Huang.pdf`。采用简短第一人称介绍与具体条目；没有把手机号、推荐人联系方式、GPA和奖学金清单加进主页，也没有提供整份CV下载。
- 初始填充包括英文名、复旦物理本科身份、研究导师与兴趣、三份工作笔记、CV中的五条学生报告及后来从播放列表新增的六条录像，以及本人学校邮箱。Research介绍随后暂时隐藏；入学与预计毕业日期、Pre-Strings暑校组织经历已按精简要求从介绍中删去。
- CV未写中文姓名，未列论文或预印本，也未提供小工具/项目名称与链接；这些内容最初留空。后续以用户直接编辑及新增项目要求为准。
- 三份笔记的Overleaf只读链接原样取自CV，未读取或修改笔记正文。
- 三个TQFT录像通过YouTube官方oEmbed标题核对为part1/2/3。CV中2026年5月“Infinitesimal Deformation of Complex Structure”误复用了第三讲URL，故该项暂不挂链接。2026年7月“Topological K-Theory”指向的是Hatcher教材而非报告录像，该项也先留空链接。
- 用户提供的 [Haiyang's Video 播放列表](https://www.youtube.com/playlist?list=PLF7gJfFJdnBY) 共9个视频，其中3个TQFT视频已收录，当时新增6条，合计11条。此前只提取标题导致遗漏；2026-11-09重新读取9个官方视频页的完整说明及明确日期，补齐所有录像的精确上传日期和5段现有视频说明，保留原有3段TQFT的CV说明。“Complex Manifold — Chapter 4”的官方页面明确没有描述，当时只补日期并暂列为独立条目。随后用户自行调整了日期和条目，将该录像链接放到复结构无穷小形变条目，当前为10条；本轮字段重命名完整保留这些修改。网页显示名称为Student Seminar，这些内容现已迁入 `content/student-seminar.md`。
- CV页眉是2026年7月，未据PDF生成时间声称所有经历更新至11月。研究以进行中项目表述，未将NSFC编号写成个人独立获资助成果。

### 视频日期与说明依据（2026-11-09核对）

下面保留视频页展开后的发布日期与说明核对记录，不是独立确认的报告举行日期。当前页面采用用户在 Markdown 中填写的日期与描述；此表不覆盖后续个人修改。

| 官方录像 | 上传日期 | 视频说明中的内容 |
| --- | --- | --- |
| [Homological Algebra — Lecture 1](https://www.youtube.com/watch?v=Ut5830WIwNM) | 2026-09-26 | Weibel第一章 |
| [Homological Algebra — Lecture 2](https://www.youtube.com/watch?v=hRs1JSN4oPE) | 2026-09-27 | delta-functor、projective resolution |
| [Homological Algebra — Lecture 3](https://www.youtube.com/watch?v=BTtkhoMhtlg) | 2026-10-10 | projective resolution、comparison theorem、horseshoe lemma、derived functors |
| [Toric Variety — Chapter 1, Lecture 1](https://www.youtube.com/watch?v=b6-ADAes4Go) | 2026-11-01 | 代数几何简述、由fans构造环簇、例子 |
| [Toric Variety — Chapter 1, Lecture 2](https://www.youtube.com/watch?v=b_hQRU8XYgE) | 2026-11-08 | 1.2凸多面锥、1.3仿射环簇、环面作用构造 |
| [Complex Manifold — Chapter 4](https://www.youtube.com/watch?v=539dNOsb4jw) | 2026-05-11 | 原视频未添加说明 |
| [TQFT — Part 1](https://www.youtube.com/watch?v=LXMUUZw8Ju8) | 2025-10-01 | 原视频未添加说明；网页保留CV内容摘要 |
| [TQFT — Part 2](https://www.youtube.com/watch?v=hfOWyLwI5Ag) | 2025-10-12 | 原视频未添加说明；网页保留CV内容摘要 |
| [TQFT — Part 3](https://www.youtube.com/watch?v=PWK3jv8AFJs) | 2025-10-26 | 原视频未添加说明；网页保留CV内容摘要 |


## 02 素材

使用用户已迁回 `Code/02-pets-migration/B` 的红制服 Q 版 02。用户最初已指定 Q 版，本次复用最终透明图集及静态帧，保留画风；不使用 D 目录中的白礼服版。
`companion.enabled` 默认为 `true`；`companion.image` 是静态后备图片，动画图集通过可选的 `companion.sprite` 配置。设为 `false` 可完全关闭角色与素材请求。图片路径相对于 `public/`，构建会自动处理 GitHub Pages 子路径。

## 发布前由你决定

1. 填写并核对个人介绍、研究方向与公开条目。
2. 选择 GitHub 所有者、仓库、根站点或项目站路径，以及是否使用自定义域名。
3. 检查计划公开的 02 素材；当前本地构建已包含用户提供的 Q 版图片。
4. 检查生成的 `dist/`。本项目未创建远程仓库、未推送、未上线。

## 玩偶交互

点击 02 可打开互动卡片：`Let 02 explore` 让她沿屏幕下沿跑动、停下来做小动作；`Bring 02 back` 召回。鼠标靠近时会停住，在头顶来回轻扫会闭眼笑。触屏或键盘可用 `Pet 02`，`Hop!` 播放跳跃。待机也会间隔出现歪头、思考、挥手和小跳，动作都来自已有高清图集。

复制章节链接和 `Continue at …` 按钮已移除，也不再记录上次浏览的栏目；仍可返回页首、暂停、隐藏和恢复。桌面原位置始终保留召回按钮；手机使用页头入口。漫游只在当前页面主动开启，不会下次访问时自行启动。隐藏与暂停状态保存在当前浏览器，系统要求减少动态效果时使用静态帧。

当前 `index.html` 中保留 `noindex, nofollow`；决定公开时再去掉。构建仅输出 `dist/`，不会把文档或测试素材自动放进网页。

## 同调代数笔记详情页

`/notes/homological-algebra/` 是现有的同调代数笔记详情页。标题、介绍以及手写版和 LaTeX 版的说明直接编辑 `content/notes/homological-algebra.md`；首页 Notes 中的入口与简短说明编辑 `content/notes.md`，入口链接写作 `notes/homological-algebra/`。不需要把笔记正文写入 JSON，也不要直接编辑构建后的 HTML。

这篇笔记的文件位于 `public/files/notes/`：

| 内容 | 文件名 |
| --- | --- |
| 手写版 PDF | `homological-algebra-handwritten.pdf` |
| 手写版首页预览 | `homological-algebra-handwritten-preview.webp` |
| LaTeX 版 PDF | `homological-algebra-latex.pdf` |
| LaTeX 版首页预览 | `homological-algebra-latex-preview.webp` |

在详情 Markdown 中，每个 PDF 使用独立的链接段落，紧接对应的首页图片段落，例如：

```markdown
[Open handwritten PDF](files/notes/homological-algebra-handwritten.pdf)

![First page of the handwritten Homological Algebra notes](files/notes/homological-algebra-handwritten-preview.webp)
```

保持这两个段落相邻，构建器会将它们组合为同一组打开、下载、页内阅读操作与首页预览。页面初次打开只加载图片；点击 **Read in page** 才请求完整 PDF，之后可以切回首页图片。浏览器关闭 JavaScript 时，首页图和直接打开、下载链接仍然可用。

页内阅读依赖浏览器的原生 PDF 查看器；不支持时不会显示 **Read in page** 按钮，仍可使用 **Open PDF** 或 **Download** 打开、保存文件。

替换 PDF 时也要更新对应首页 WebP，以及 Markdown 中的页数、文件大小和版本说明。原手写版与 OCR 后整理的 LaTeX 版应继续明确区分，保留后者的修订与补充说明。保存 Markdown 后本地预览会刷新；发布前运行 `npm run build`，输出仍在 `dist/`。

## Markdown 中的数学公式

主页正文与笔记详情都支持 LaTeX 数学语法。行内公式用 `$...$` 或 `\(...\)`；独立公式用 `$$...$$` 或 `\[...\]`，建议将独立公式的起止标记各放一行。例如：

```markdown
We study $\mathcal{N}=2$ theories with gauge group \(SU(3)\).

$$
H^n(C^\bullet)=\ker d^n/\operatorname{im} d^{n-1}
$$

\[
E=mc^2
\]
```

公式可以出现在链接文字中，例如 `[class $\mathcal{S}$](https://arxiv.org/abs/0904.2715)`。行内代码和代码块中的数学标记保持原样，不会变成公式；需要展示源码时仍使用反引号。正文中的普通美元符号可写成 `\$`。

公式由构建时的 KaTeX 转成可视 HTML 与辅助阅读用的 MathML，字体随站点一起加载；不依赖浏览器 JavaScript 解析，所以关闭 JavaScript 仍可阅读。过长的独立公式在自身区域横向滚动，不会撑宽整个页面。内容使用 KaTeX 支持的数学命令，不加载完整 LaTeX 宏包，也不允许公式创建任意 HTML 或执行脚本。
