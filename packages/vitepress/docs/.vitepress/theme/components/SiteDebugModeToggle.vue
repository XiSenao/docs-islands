<script setup lang="ts">
import { querySelectorAllToArray } from '@docs-islands/utils/dom-iterable';
import {
  isSiteDebugEnabled,
  SITE_DEBUG_MODE_EVENT_NAME,
  type SiteDebugModeChangeDetail,
  toggleSiteDebugEnabled,
} from '@docs-islands/vitepress/internal/debug';
import { onBeforeUnmount, onMounted, ref } from 'vue';

const debugEnabled = ref(false);
const clickCount = ref(0);
const toastVisible = ref(false);
const toastMessage = ref('');

let clickTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let toastTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
let triggerElements: InstanceType<typeof globalThis.HTMLElement>[] = [];
let triggerObserver: InstanceType<typeof globalThis.MutationObserver> | null =
  null;

const clearClickTimer = () => {
  if (clickTimer !== undefined) {
    globalThis.clearTimeout(clickTimer);
    clickTimer = undefined;
  }
};

const clearToastTimer = () => {
  if (toastTimer !== undefined) {
    globalThis.clearTimeout(toastTimer);
    toastTimer = undefined;
  }
};

const showToast = (message: string) => {
  toastMessage.value = message;
  toastVisible.value = true;
  clearToastTimer();
  toastTimer = globalThis.setTimeout(() => {
    toastVisible.value = false;
    toastTimer = undefined;
  }, 2400);
};

const resetClickSequence = () => {
  clickCount.value = 0;
  clearClickTimer();
};

const updateTriggerDecorations = () => {
  const title = debugEnabled.value
    ? 'Debug site is enabled. Triple-click the logo to disable.'
    : 'Debug site is disabled. Triple-click the logo to enable.';

  for (const element of triggerElements) {
    element.classList.add('site-debug-mode-entry__trigger');
    element.classList.toggle('is-active', debugEnabled.value);
    element.setAttribute('title', title);
    element.setAttribute('aria-label', title);
  }
};

const unbindTriggerElements = () => {
  for (const element of triggerElements) {
    element.removeEventListener('click', handleTriggerClick);
    element.classList.remove('site-debug-mode-entry__trigger', 'is-active');
    element.removeAttribute('title');
    element.removeAttribute('aria-label');
  }

  triggerElements = [];
};

const bindTriggerElements = () => {
  const nextElements = querySelectorAllToArray(
    globalThis.document,
    '.VPNavBarTitle .title .logo',
  ).filter(
    (element): element is InstanceType<typeof globalThis.HTMLElement> =>
      element instanceof globalThis.HTMLElement,
  );

  if (
    nextElements.length === triggerElements.length &&
    nextElements.every((element, index) => element === triggerElements[index])
  ) {
    updateTriggerDecorations();
    return;
  }

  unbindTriggerElements();
  triggerElements = nextElements;

  for (const element of triggerElements) {
    element.addEventListener('click', handleTriggerClick);
  }

  updateTriggerDecorations();
};

const handleTriggerClick = (event: globalThis.Event) => {
  event.preventDefault();
  event.stopPropagation();

  const nextCount = clickCount.value + 1;

  clickCount.value = nextCount;
  clearClickTimer();

  if (nextCount >= 3) {
    resetClickSequence();
    toggleSiteDebugEnabled({
      clearQueryOverride: true,
      source: 'nav-logo',
    });
    return;
  }

  clickTimer = globalThis.setTimeout(() => {
    clickCount.value = 0;
    clickTimer = undefined;
  }, 520);
};

const handleModeChange = (event: globalThis.Event) => {
  const detail = (event as globalThis.CustomEvent<SiteDebugModeChangeDetail>)
    .detail;

  debugEnabled.value = detail?.enabled ?? isSiteDebugEnabled();
  updateTriggerDecorations();
  showToast(
    debugEnabled.value ? 'Debug site mode enabled' : 'Debug site mode disabled',
  );
};

onMounted(() => {
  debugEnabled.value = isSiteDebugEnabled();
  bindTriggerElements();
  globalThis.addEventListener(
    SITE_DEBUG_MODE_EVENT_NAME,
    handleModeChange as globalThis.EventListener,
  );
  triggerObserver = new globalThis.MutationObserver(() => {
    bindTriggerElements();
  });
  triggerObserver.observe(globalThis.document.body, {
    childList: true,
    subtree: true,
  });
});

onBeforeUnmount(() => {
  globalThis.removeEventListener(
    SITE_DEBUG_MODE_EVENT_NAME,
    handleModeChange as globalThis.EventListener,
  );
  triggerObserver?.disconnect();
  triggerObserver = null;
  unbindTriggerElements();
  clearClickTimer();
  clearToastTimer();
});
</script>

<template>
  <transition name="site-debug-mode-entry-toast">
    <div
      v-if="toastVisible"
      class="site-debug-mode-entry__toast"
      :class="{ 'is-active': debugEnabled }"
      role="status"
      aria-live="polite"
    >
      {{ toastMessage }}
    </div>
  </transition>
</template>

<style scoped>
:global(.site-debug-mode-entry__trigger) {
  cursor: pointer;
  transition:
    transform 180ms ease,
    filter 180ms ease,
    opacity 180ms ease;
}

:global(.site-debug-mode-entry__trigger:hover) {
  transform: translateY(-1px);
}

:global(.site-debug-mode-entry__trigger.is-active) {
  filter: drop-shadow(0 0 10px rgb(99 102 241 / 0.28));
}

.site-debug-mode-entry__toast {
  position: fixed;
  top: calc(var(--vp-nav-height) + 12px);
  left: 50%;
  z-index: 180;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 82%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--vp-c-bg) 94%, transparent);
  box-shadow: 0 18px 48px rgb(8 12 20 / 0.18);
  box-sizing: border-box;
  color: var(--vp-c-text-1);
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.4;
  max-width: calc(100vw - 1.5rem);
  padding: 0.72rem 0.92rem;
  text-align: center;
  transform: translateX(-50%);
  backdrop-filter: blur(12px);
}

.site-debug-mode-entry__toast.is-active {
  border-color: color-mix(
    in srgb,
    var(--vp-c-brand-1) 34%,
    var(--vp-c-divider)
  );
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--vp-c-bg));
}

.site-debug-mode-entry-toast-enter-active,
.site-debug-mode-entry-toast-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.site-debug-mode-entry-toast-enter-from,
.site-debug-mode-entry-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

@media (max-width: 767px) {
  .site-debug-mode-entry__toast {
    max-width: calc(100vw - 1rem);
  }
}
</style>
