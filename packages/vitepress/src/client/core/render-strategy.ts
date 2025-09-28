// Minimal base render strategy for cross-framework reuse.
export class BaseRenderStrategy {
  // Reserved for future shared logic (visibility observer, SPA sync hooks, etc.)
  protected _noop(): void {
    // Intentionally empty: provide a minimal runtime member
  }
}
