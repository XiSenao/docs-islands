import SiteDebugJsonFallback from '../SiteDebugJsonFallback.vue';

const siteDebugJsonFallback =
  SiteDebugJsonFallback as typeof SiteDebugJsonFallback & {
    __DOCS_ISLANDS_OPTIONAL_DEPENDENCY_FALLBACK__?: boolean;
  };

siteDebugJsonFallback.__DOCS_ISLANDS_OPTIONAL_DEPENDENCY_FALLBACK__ = true;

export default siteDebugJsonFallback;
