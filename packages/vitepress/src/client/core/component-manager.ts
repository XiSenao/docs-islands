// Minimal base component manager for cross-framework reuse.
// Concrete managers (e.g., ReactComponentManager) can extend this class.
export class BaseComponentManager {
  // Reserved for framework-agnostic utilities in the future.
  protected _noop(): void {
    // Intentionally empty: provide a minimal runtime member
  }
}
