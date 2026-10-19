import type { ComponentType } from 'react'

export type Disposer = () => void

export interface ObservableSnapshot<T> {
  getSnapshot(): T
  subscribe(listener: () => void): Disposer
}

export type SnapshotSelectorHook<T> = <S>(
  selector: (snapshot: T) => S,
  equal?: (left: S, right: S) => boolean,
) => S

export interface WorkspaceItem {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
  readonly sessionIds: readonly string[]
}

export interface WorkspaceSnapshot {
  readonly items: readonly WorkspaceItem[]
}

export interface PanelIconProps {
  readonly size: number
  readonly active: boolean
}

export interface PanelProps {
  readonly useMedicalWorkspaces: SnapshotSelectorHook<WorkspaceSnapshot>
  readonly close: () => void
  readonly prepare: (workspaceId: string | undefined, prompt: string) => void
}

interface NavigationRegistration {
  readonly name: 'sidebar.panellist'
  readonly id: string
  readonly order: number
  readonly label: string
}

interface PanelRegistration {
  readonly name: 'main'
  readonly key: string
  readonly inject: () => {
    readonly hooks: {
      readonly medicalWorkspaces: ObservableSnapshot<WorkspaceSnapshot>
    }
    readonly close: PanelProps['close']
    readonly prepare: PanelProps['prepare']
  }
}

export interface SlotRegistry {
  inject(name: 'sidebar.panellist' | 'main', setup: () => Disposer): Disposer
  register(options: NavigationRegistration, component: ComponentType<PanelIconProps>): Disposer
  register(options: PanelRegistration, component: ComponentType<PanelProps>): Disposer
}

export interface MedicalClientContext {
  readonly slots: SlotRegistry
  readonly workspaces: { readonly list: ObservableSnapshot<WorkspaceSnapshot> }
  readonly layout: { selectPanel(panelId: null): void }
  readonly uiWorkspace: {
    startSession(workspaceId: string | undefined, options: {
      readonly prompt: string
      readonly clearPreviousDraft: false
    }): void
  }
  effect(setup: () => Disposer, label?: string): Disposer
}
