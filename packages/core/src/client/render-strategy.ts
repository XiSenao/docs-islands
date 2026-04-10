// Minimal base render strategy for cross-framework reuse.
export class BaseRenderStrategy {
  protected _noop(): void {
    // Intentionally empty: preserve a minimal shared runtime surface.
  }
}
