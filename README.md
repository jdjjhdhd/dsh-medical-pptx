# 医学文献汇报

面向 DeepSeek Harness 0.2.1-rc.2 的本地插件：侧栏填写单篇论文的汇报要求，在原生会话附上论文，使用医学技能提取可追溯证据，并生成可编辑的 PPTX 草稿。

第一版面向单篇医学原创研究的中文汇报，可保留英文论文标题、术语与原文引用。默认结构包含研究问题、方法、结果、安全性、局限、结论和来源。

## 下载与安装

1. 打开本仓库的 **Releases**，下载 `dsh-medical-pptx-0.1.4.tgz`，无需解压。不要把 GitHub 自动生成的 Source code 压缩包当成插件安装包。
2. 当前已验证环境为 Windows、DeepSeek Harness **0.2.1-rc.2**。PPTX 导出需要终端可运行 **Node.js ≥22.19**（可用 `node --version` 检查），安装需要联网下载依赖。模型使用你自己在客户端中的配置。
3. 完全退出客户端，在下载目录打开 PowerShell，使用客户端自带的 CLI 安装。`dsh.cmd` 位于客户端安装目录下的 `resources\runtime\cli\bin`：

   ```powershell
   $dshCli = Read-Host '请输入客户端自带 dsh.cmd 的完整路径（不加引号）'
   $pluginTgz = (Resolve-Path -LiteralPath '.\dsh-medical-pptx-0.1.4.tgz').Path
   if (-not (Test-Path -LiteralPath $dshCli -PathType Leaf)) { throw '找不到 dsh.cmd，请检查实际安装目录。' }
   & $dshCli plugin --profile desktop add $pluginTgz
   ```

4. 安装成功后重新打开客户端，左侧会出现“医学课件”。保留安装用的 tgz，以便后续重装。

这是试用版：已验证安装、界面、草稿准备、结构校验和模拟资料导出；真实论文仍须核对读取范围、原文数字和引用。

## 使用

1. 点击侧栏“医学课件”，选择工作区、受众、材料范围和时长。
2. 点击“准备汇报任务”，在打开的原生会话中附上 PDF 或粘贴正文，再发送。
3. Agent 根据实际读到的材料建立证据与引用记录，调用随包生成器导出 PPTX。

插件不会自动发送草稿或另接模型服务。它检查引用关联与数据结构，不会证明论文结论或医学内容正确。仅摘要时，课件会保留材料范围提示。生成结果为待核对草稿。

## 开发

```powershell
npm install
npm run typecheck
npm run build
npm test
```

开发者打包：

```powershell
New-Item -ItemType Directory -Path dist -Force | Out-Null
npm pack --pack-destination dist
```

安装方式见上文；本地开发时将 `pluginTgz` 指向打包生成的文件。使用桌面客户端自己的 CLI 和 `desktop` 配置。

生成器帮助：`node scripts/generate.mjs --help`。格式示例为明确标注的模拟材料，不能当作真实医学证据。

学术表达原则参考 [academic-pptx-skill](https://github.com/Gabberflast/academic-pptx-skill)；医学工作流和渲染器在本插件中独立实现。来源与许可见 `THIRD_PARTY_NOTICES.md`。
