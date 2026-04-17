export interface SiteDevToolsCapability {
  readonly enabled: boolean;
}

export function createSiteDevToolsCapability(
  enabled: boolean,
): SiteDevToolsCapability {
  return {
    enabled,
  };
}
