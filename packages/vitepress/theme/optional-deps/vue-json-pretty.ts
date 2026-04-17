import SiteDevToolsJsonFallback from '../SiteDevToolsJsonFallback.vue';

const siteDevtoolsJsonFallback =
  SiteDevToolsJsonFallback as typeof SiteDevToolsJsonFallback & {
    __DOCS_ISLANDS_OPTIONAL_DEPENDENCY_FALLBACK__?: boolean;
  };

siteDevtoolsJsonFallback.__DOCS_ISLANDS_OPTIONAL_DEPENDENCY_FALLBACK__ = true;

export default siteDevtoolsJsonFallback;
