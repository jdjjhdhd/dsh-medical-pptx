declare module '@deepseek-ai/dsh-client-store' {
  export interface SnapshotStore<T> {
    getSnapshot(): T;
    subscribe(listener: () => void): () => void;
    set(value: T): void;
  }
  export function createSnapshotStore<T>(initial: T): SnapshotStore<T>;
}
