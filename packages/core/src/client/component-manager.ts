// Minimal base component manager for cross-framework reuse.
// Concrete managers (for example React) can extend this class.
export class BaseComponentManager {
  protected _noop(): void {
    // Intentionally empty: preserve a minimal shared runtime surface.
  }
}
