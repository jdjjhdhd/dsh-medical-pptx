# 证据 JSON 与生成命令

本文件描述随插件打包的本地生成器格式。JSON 必须是 UTF-8；字段名区分大小写，枚举值使用下列英文值，显示文本可用中文。对象不接受未定义的额外字段；所有文本字段禁止制表符（`\t`）。不要把下面的格式说明或模拟数据当成真实论文证据。

## 顶层结构

| 字段 | 约定 |
| --- | --- |
| `schemaVersion` | 必填，数值 `1`。 |
| `demo` | 布尔值，省略时为 `false`；只有模拟练习使用 `true`。真实论文不能混入模拟事实。 |
| `paper` | 必填对象：`title`（论文题名）、`citation`（原始文献完整引用）、`studyDesign`。 |
| `material` | 必填对象：`coverage`、可选 `notes`（材料缺口或读取边界）。 |
| `sources` | 必填来源数组：每项含唯一 `id`、`label`，可选 `url`（HTTPS）。本地论文可在 `label` 写文件名，不必编造网址。 |
| `facts` | 必填事实数组；每条事实有唯一 ID，以供幻灯片引用。见下节。 |
| `slides` | 必填内容页数组；封面和参考文献页由生成器加入。见“页面”一节。 |

`paper.studyDesign`：`randomized`、`cohort`、`case_control`、`cross_sectional`、`other`、`unclear`。不能识别时使用 `unclear`，不要猜测。

`material.coverage`：`abstract`、`partial`、`full_text`、`full_text_and_supplement`。按实际读到的范围填写，不按附件名或链接推定。仅摘要或部分正文时，用 `material.notes` 说清哪些内容未取得或未解析。

所有 ID 为 1–64 个字符，以英文字母或数字开头，后续只允许英文字母、数字、点、下划线、连字符。`sources` 为 1–24 项，`facts` 为 1–80 项。题名最多 140 字符，完整引用 240 字符，来源标签 180 字符，材料备注 400 字符；较长原文引用须凝练后保留可追溯信息，不伪造缺少的书目信息。`paper.title`、`paper.citation`、`sources[].label` 必须是单行字符串，不能包含内部换行；生成时仍可正常自动视觉换行。

## 事实和出处

每条 `facts[]` 的字段：

| 字段 | 约定 |
| --- | --- |
| `id` | 必填唯一字符串，供 `slides[].factIds` 引用。 |
| `label` | 必填，简短说明，例如“主要终点”“分析集”“研究局限”。 |
| `status` | 必填，见状态表。 |
| `value` | 必填。`reported` 时为非空原文事实摘要；其他状态必须为 `null`。 |
| `refs` | 必填数组，每项为 `{ "sourceId": "来源ID", "locator": "第5页，表2" }`。`sourceId` 必须存在于 `sources`；最多 12 个不同定位。 |
| `note` | 可选，说明缺口、冲突或统计口径；不能在这里藏入未经溯源的结果。 |
| `statistics` | 可选，仅 `reported` 可填，见下节。 |

| `status` | 展示含义及使用条件 |
| --- | --- |
| `reported` | 已在实际读取材料中找到；`value` 非空且至少一个有效来源定位。 |
| `not_reported` | 已核对的材料范围内未报告；用 `note` 限定范围，不能据此宣称全文没有报告。 |
| `not_available` | 当前未取得或未成功读取所需材料。 |
| `conflicting` | 来源不一致；`value: null`，至少两个不同定位，`note` 说明冲突。 |
| `not_applicable` | 对该研究不适用；用 `note` 解释。 |

非 `reported` 状态不能带 `statistics`。不要用空字符串、零或“暂无”充当缺失数值。来源定位应能帮助人回到原文；结构检查不能确认该页是否支持此结论。

`label` 最多 60 字符，`value` 最多 300 字符，`note` 最多 160 字符，单个 `locator` 最多 240 字符。较长结论应拆成独立事实，不能截去关键限定词。

## 可选统计对象

`statistics.counts`：

```text
{ unit, numerator, denominator?, analysisSet, timepoint }
```

- `unit`：`participants`（受试者人数）或 `events`（事件次数）。
- `numerator`：非负整数；`denominator` 如填须为大于零的整数。零人群不能作为分母；原文无法给出有效分母时省略并说明。
- `analysisSet`、`timepoint`：必填字符串，保留原文分析集及时间点，不能默认所有结果均用总入组人数。
- 若摘要未给出某结果的观察窗，`timepoint` 可明确写“摘要未报告安全性观察窗”等缺失说明，不把主要终点时间自动套到其他结果。
- `participants` 且有分母时，分子不能超过分母；`events` 的事件次数可以超过受试者人数。不要把事件次数除以人数后称为“受试者发生率”。

`statistics.effect`：

```text
{ measure, value, ci?: { level, lower, upper } }
```

- `measure` 为原文效应量类型（如 `HR`、`OR`、`RR`、均值差），`value` 为有限数值。
- `ci.level` 为百分数数值，例如 `95` 或 `90`，不是 `0.95`；须大于 `0`、小于 `100`。
- `lower`、`upper` 为有限数值，下限不得超过上限。原文未给 CI 时省略 `ci`，并在事实 `note` 说明，不从 P 值补算。
- 比较方向、单位、调整情况、分析集和时间点应写清在事实 `value`/`note` 中。P 值、连续变量摘要及其他未设专用字段的信息直接忠实写入 `value`，不要添加猜测的 JSON 键。

结构统计与 `value` 中的显示文本必须一致。即使局部数值检查通过，仍须对照原文核对量纲、分母、效应类型及区间。

## 页面

每条 `slides[]`：

```text
{ section, title, factIds, discussion? }
```

- `section` 使用 `pico`、`methods`、`results`、`safety`、`limitations`、`conclusion` 六类，每类至少一页；输入正文共 6–28 页。
- `title` 为单行页面标题（最多 48 字符，字符串内部禁止换行，自动视觉换行正常），`factIds` 为引用的事实 ID 数组，每页 1–4 个，不可重复或引用不存在的事实；不能直接复制另一研究的事实 ID。
- 可选 `discussion`（最多 280 字符）放汇报者解读或待核对问题，允许正常段落换行；整段超出单页可读高度时会明确拒绝，须拆页，不会截断。作者结论应作为有出处的事实，再用 `factIds` 引用，不与汇报者解读混在一起。
- 六类页面用于覆盖研究问题、设计、人群、结果、安全性、局限及结论；安全性未报告时保留该页并明确缺口，不编数据。
- 生成器自动加入封面和引用页，整套最多 30 页。长字段或内容过多会报出字段路径；按逻辑精简或拆页后重试，不截断关键结果，也不通过缩小到不可读字号绕过限制。
- CLI 返回的 `logicalSlides` 是输入内容单元数；自动分页、封面和引用页会增加实际张数。交付时以实际 PPTX 页数说明汇报长度。

## 命令

设 `$skillDir` 为当前已加载技能的实际目录，`$workspaceDir` 为用户选定的当前论文项目目录的绝对路径。这两个路径由原生文件工具确认，不猜测客户端安装位置。所有 CLI 输入与输出路径都必须在 `$workspaceDir` 内（含其子目录）。

每次调用生成 CLI 时，终端的当前工作目录必须是 `$workspaceDir`：设置终端工具的 `workdir`，或先执行下列示例中的 `Set-Location`。禁止将当前工作目录设为插件安装目录；插件路径只用于定位生成脚本。新开终端调用时也要确认工作目录，不能仅凭输入输出使用了绝对路径就省略这一步。

查看完整模拟格式（只用于学习 JSON，不会读取或代表用户论文）：

```powershell
Set-Location -LiteralPath $workspaceDir
node "$skillDir/../../scripts/generate.mjs" --example
```

先校验结构：

```powershell
Set-Location -LiteralPath $workspaceDir
node "$skillDir/../../scripts/generate.mjs" --input "$workspaceDir/deck.json" --validate-only
```

通过后生成 PPTX：

```powershell
Set-Location -LiteralPath $workspaceDir
node "$skillDir/../../scripts/generate.mjs" --input "$workspaceDir/deck.json" --output "$workspaceDir/文献汇报.pptx"
```

生成器拒绝覆盖已有输出文件；重做时换一个明确的新文件名。

只使用客户端已有终端和已打包运行文件。不自动安装依赖，不新增外部 API；命令错误按实际输出定位。`--validate-only` 只做结构校验，不验证论文真实性、引用支撑关系、医学适用性或视觉布局。生成成功也不能替代原文数字核对和可用时的视觉预览。
