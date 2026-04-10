export interface SiteDebugCapability {
  readonly enabled: boolean;
}

export function createSiteDebugCapability(
  enabled: boolean,
): SiteDebugCapability {
  return {
    enabled,
  };
}
