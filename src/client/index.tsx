import { useId, useState, type FormEvent } from 'react'
import {
  AUDIENCE_OPTIONS,
  DEFAULT_REPORT_OPTIONS,
  MATERIAL_OPTIONS,
  buildMedicalReportPrompt,
  type MaterialScope,
  type ReportAudience,
} from '../prompt.js'
import type {
  MedicalClientContext,
  PanelIconProps,
  PanelProps,
} from './types.js'

const PANEL_ID = 'medical-pptx'

const CSS = `
.medical-pptx-page{box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:auto;padding:28px 24px;background:var(--dsw-alias-bg-base,#f7f8fa);font-family:var(--dsw-font-family,system-ui,sans-serif);color:var(--dsw-alias-label-primary,#172033);-webkit-app-region:no-drag}
.medical-pptx-panel{box-sizing:border-box;display:flex;flex-direction:column;width:min(760px,100%);margin:0 auto;border:1px solid var(--dsw-alias-border-l3,#d7dce3);border-radius:var(--dsw-radius-lg,16px);background:var(--dsw-alias-bg-layer-1,#fff)}
.medical-pptx-panel *{box-sizing:border-box}
.medical-pptx-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:22px 24px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,#e2e6eb)}
.medical-pptx-header h2{margin:0;font-size:20px;line-height:1.35;font-weight:650}
.medical-pptx-caption{margin:6px 0 0;font-size:13px;line-height:1.5;opacity:.66}
.medical-pptx-body{padding:20px 24px}
.medical-pptx-notice{padding:12px 14px;margin:0 0 20px;border:1px solid var(--dsw-alias-border-l2,#e2e6eb);border-radius:var(--dsw-radius-sm,8px);font-size:13px;line-height:1.65;background:var(--dsw-alias-interactive-bg-hover,#f0f3f7)}
.medical-pptx-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px 16px}
.medical-pptx-field{display:flex;flex-direction:column;gap:7px;min-width:0;font-size:13px}
.medical-pptx-wide{grid-column:1/-1}
.medical-pptx-label{font-weight:600}
.medical-pptx-optional{font-weight:400;opacity:.6;margin-left:5px}
.medical-pptx-field input,.medical-pptx-field select,.medical-pptx-field textarea{width:100%;padding:10px 11px;min-height:40px;border:1px solid var(--dsw-alias-border-l3,#d7dce3);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-base,#fff);color:inherit;font:inherit;line-height:1.5}
.medical-pptx-field textarea{resize:vertical;min-height:88px;max-height:240px}
.medical-pptx-help{margin:0;font-size:12px;line-height:1.55;opacity:.65;overflow-wrap:anywhere}
.medical-pptx-empty{padding:13px 14px;border:1px dashed var(--dsw-alias-border-l4,#b9c2ce);border-radius:var(--dsw-radius-sm,8px);font-size:13px;line-height:1.65}
.medical-pptx-error{margin:16px 0 0;color:var(--dsw-alias-state-error-primary,#bd2424);font-size:13px;line-height:1.6}
.medical-pptx-footer{padding:16px 24px;border-top:1px solid var(--dsw-alias-border-l2,#e2e6eb);display:flex;align-items:center;justify-content:space-between;gap:16px}
.medical-pptx-footer-note{font-size:12px;line-height:1.5;opacity:.65}
.medical-pptx-actions{display:flex;gap:8px;flex-shrink:0}
.medical-pptx-secondary,.medical-pptx-primary{border-radius:var(--dsw-radius-sm,8px);padding:10px 14px;font:inherit;font-size:13px;line-height:1.4;cursor:pointer}
.medical-pptx-secondary{border:1px solid var(--dsw-alias-border-l3,#d7dce3);background:transparent;color:inherit}
.medical-pptx-primary{border:1px solid transparent;background:var(--dsw-alias-button-primary-fill,#2563eb);color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:600}
.medical-pptx-primary:disabled{opacity:.45;cursor:not-allowed}
.medical-pptx-panel :focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#2563eb);outline-offset:2px}
@media(max-width:720px){.medical-pptx-page{padding:16px 12px}.medical-pptx-header{padding:18px 16px 14px}.medical-pptx-body{padding:16px}.medical-pptx-grid{grid-template-columns:1fr;gap:16px}.medical-pptx-footer{padding:14px 16px;align-items:stretch;flex-direction:column;gap:10px}.medical-pptx-actions{justify-content:flex-end}.medical-pptx-header h2{font-size:19px}}
`

function PanelIcon({ size }: PanelIconProps) {
  return <span aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>▤</span>
}

function MedicalPanel(props: PanelProps) {
  const workspaces = props.useMedicalWorkspaces(snapshot => snapshot.items)
  const [workspaceId, setWorkspaceId] = useState('')
  const [paperPath, setPaperPath] = useState(DEFAULT_REPORT_OPTIONS.paperPath)
  const [notes, setNotes] = useState(DEFAULT_REPORT_OPTIONS.notes)
  const [audience, setAudience] = useState<ReportAudience>(DEFAULT_REPORT_OPTIONS.audience)
  const [duration, setDuration] = useState(String(DEFAULT_REPORT_OPTIONS.durationMinutes))
  const [materialScope, setMaterialScope] = useState<MaterialScope>(DEFAULT_REPORT_OPTIONS.materialScope)
  const [error, setError] = useState('')
  const id = useId()
  const titleId = `${id}-title`
  const introId = `${id}-intro`
  const formId = `${id}-form`

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (workspaces.length === 0) {
      setError('请先在左侧添加一个工作区目录。')
      return
    }
    if (workspaceId !== '' && !workspaces.some(workspace => workspace.workspaceId === workspaceId)) {
      setError('所选工作区已不可用，请重新选择。')
      return
    }
    try {
      const prompt = buildMedicalReportPrompt({
        paperPath, notes, audience, language: 'zh-CN', materialScope,
        durationMinutes: Number(duration),
      })
      props.prepare(workspaceId || undefined, prompt)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : '任务未能准备，请检查填写内容后重试。')
    }
  }

  return <main className="medical-pptx-page" aria-labelledby={titleId} aria-describedby={introId}>
    <div className="medical-pptx-panel">
      <header className="medical-pptx-header">
        <div>
          <h2 id={titleId}>准备医学文献汇报</h2>
          <p className="medical-pptx-caption">单篇论文 · 研究证据 · 汇报课件</p>
        </div>
      </header>
      <div className="medical-pptx-body">
        <p className="medical-pptx-notice" id={introId}>
          填写要求后，在原生会话附上论文 PDF 或粘贴正文，检查任务再发送。此面板尚未读取论文。
        </p>
        <form id={formId} onSubmit={prepare} className="medical-pptx-grid">
          <div className="medical-pptx-field medical-pptx-wide">
            <label className="medical-pptx-label" htmlFor={`${id}-workspace`}>工作区</label>
            <select id={`${id}-workspace`} value={workspaceId}
              disabled={workspaces.length === 0} onChange={event => setWorkspaceId(event.target.value)}
              aria-describedby={`${id}-workspace-help`}>
              <option value="">当前工作区</option>
              {workspaces.map(workspace => <option key={workspace.workspaceId} value={workspace.workspaceId}>
                {workspace.title || workspace.path}
              </option>)}
            </select>
            {workspaces.length === 0
              ? <div className="medical-pptx-empty" id={`${id}-workspace-help`} role="status">
                当前没有可用工作区。请先在左侧添加一个项目目录，再回来准备汇报。
              </div>
              : <p className="medical-pptx-help" id={`${id}-workspace-help`}>
                {workspaceId === '' ? '沿用当前会话的工作区；没有当前会话时使用最近的工作区。'
                  : workspaces.find(workspace => workspace.workspaceId === workspaceId)?.path ?? '请重新选择工作区。'}
              </p>}
          </div>
          <div className="medical-pptx-field medical-pptx-wide">
            <label className="medical-pptx-label" htmlFor={`${id}-paper`}>
              论文文件名或路径<span className="medical-pptx-optional">可选</span>
            </label>
            <input id={`${id}-paper`} type="text" value={paperPath} onChange={event => setPaperPath(event.target.value)}
              placeholder="例如：paper.pdf 或工作区中的文件路径" aria-describedby={`${id}-paper-help`} />
            <p className="medical-pptx-help" id={`${id}-paper-help`}>仅记录来源线索。也可以留空，在下一步直接附上 PDF。</p>
          </div>
          <div className="medical-pptx-field">
            <label className="medical-pptx-label" htmlFor={`${id}-audience`}>受众</label>
            <select id={`${id}-audience`} value={audience} onChange={event => setAudience(event.target.value as ReportAudience)}>
              {AUDIENCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="medical-pptx-field">
            <span className="medical-pptx-label">课件语言：中文</span>
            <p className="medical-pptx-help">可保留英文术语和原文引用。</p>
          </div>
          <div className="medical-pptx-field">
            <label className="medical-pptx-label" htmlFor={`${id}-duration`}>汇报时长（分钟）</label>
            <input id={`${id}-duration`} type="number" min={5} max={45} step={1} required
              value={duration} onChange={event => setDuration(event.target.value)} />
          </div>
          <div className="medical-pptx-field">
            <label className="medical-pptx-label" htmlFor={`${id}-materials`}>可提供的材料范围</label>
            <select id={`${id}-materials`} value={materialScope} onChange={event => setMaterialScope(event.target.value as MaterialScope)}>
              {MATERIAL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="medical-pptx-field medical-pptx-wide">
            <label className="medical-pptx-label" htmlFor={`${id}-notes`}>
              附加说明或希望讨论的问题<span className="medical-pptx-optional">可选</span>
            </label>
            <textarea id={`${id}-notes`} rows={3} value={notes} onChange={event => setNotes(event.target.value)}
              placeholder="例如：重点讨论研究设计、终点选择和结果能否用于本院人群" />
          </div>
        </form>
        {error !== '' && <p className="medical-pptx-error" role="alert">{error}</p>}
      </div>
      <footer className="medical-pptx-footer">
        <span className="medical-pptx-footer-note">下一步：附上资料 → 检查任务 → 发送</span>
        <div className="medical-pptx-actions">
          <button className="medical-pptx-secondary" type="button" onClick={props.close}>返回会话</button>
          <button className="medical-pptx-primary" type="submit" form={formId} disabled={workspaces.length === 0}>准备汇报任务</button>
        </div>
      </footer>
    </div>
  </main>
}

export const inject = ['slots', 'layout', 'uiWorkspace', 'workspaces']

export function apply(ctx: MedicalClientContext): void {
  const close = () => { ctx.layout.selectPanel(null) }
  const prepare = (workspaceId: string | undefined, prompt: string) => {
    const workspaces = ctx.workspaces.list.getSnapshot().items
    if (workspaces.length === 0) throw new Error('请先在左侧添加一个工作区目录。')
    if (workspaceId !== undefined && !workspaces.some(workspace => workspace.workspaceId === workspaceId)) {
      throw new Error('所选工作区已不可用，请重新选择。')
    }
    ctx.uiWorkspace.startSession(workspaceId, { prompt, clearPreviousDraft: false })
  }
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-dsh-plugin', 'medical-pptx')
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'medical-pptx: styles')
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: PANEL_ID,
    inject: () => ({ hooks: { medicalWorkspaces: ctx.workspaces.list }, close, prepare }),
  }, MedicalPanel))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, label: '医学课件', order: 30,
  }, PanelIcon))
}
