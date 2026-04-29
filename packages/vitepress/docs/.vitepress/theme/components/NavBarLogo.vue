<script setup lang="ts">
import { useData } from 'vitepress';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const { isDark } = useData();

const logoRef = ref<InstanceType<typeof globalThis.SVGSVGElement> | null>(null);
const hasMounted = ref(false);
let themeLogoAnimation: InstanceType<typeof globalThis.Animation> | undefined;
let themeAnimationTimeout:
  | number
  | ReturnType<typeof globalThis.setTimeout>
  | undefined;

const prefersReducedMotion = () =>
  globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

const canAnimateAppearanceTransition = () =>
  typeof globalThis.document.startViewTransition === 'function' &&
  !prefersReducedMotion();

const animateThemeSwitch = (dark: boolean) => {
  const logo = logoRef.value;
  if (!logo || prefersReducedMotion()) {
    return;
  }

  themeLogoAnimation?.cancel();
  themeLogoAnimation = logo.animate(
    [
      {
        transform: 'scale(1) rotate(0deg)',
        filter: 'drop-shadow(0 0 0 rgb(0 0 0 / 0))',
      },
      {
        transform: `scale(1.08) rotate(${dark ? '8deg' : '-8deg'})`,
        filter: dark
          ? 'drop-shadow(0 0 14px rgb(129 140 248 / 0.38))'
          : 'drop-shadow(0 0 12px rgb(99 102 241 / 0.25))',
        offset: 0.45,
      },
      {
        transform: 'scale(1) rotate(0deg)',
        filter: 'drop-shadow(0 0 0 rgb(0 0 0 / 0))',
      },
    ],
    {
      duration: 640,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  );

  themeLogoAnimation.onfinish = () => {
    themeLogoAnimation = undefined;
  };
};

onMounted(() => {
  hasMounted.value = true;
});

onBeforeUnmount(() => {
  if (themeAnimationTimeout !== undefined) {
    globalThis.clearTimeout(themeAnimationTimeout);
  }
  themeLogoAnimation?.cancel();
});

watch(
  () => isDark.value,
  async (dark) => {
    if (!hasMounted.value) {
      return;
    }

    await nextTick();

    if (themeAnimationTimeout !== undefined) {
      globalThis.clearTimeout(themeAnimationTimeout);
      themeAnimationTimeout = undefined;
    }

    if (!dark && canAnimateAppearanceTransition()) {
      themeAnimationTimeout = globalThis.setTimeout(() => {
        animateThemeSwitch(dark);
        themeAnimationTimeout = undefined;
      }, 260);
      return;
    }

    animateThemeSwitch(dark);
  },
);
</script>

<template>
  <svg
    ref="logoRef"
    class="logo"
    viewBox="0 0 120 120"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <defs>
      <filter
        id="docs-islands-vitepress-nav-glow"
        x="-20%"
        y="-20%"
        width="140%"
        height="140%"
      >
        <feGaussianBlur stdDeviation="2.4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <g class="logo-group" stroke-linecap="round" stroke-linejoin="round">
      <line
        class="draw draw-1 s1"
        x1="30"
        y1="45"
        x2="30.1"
        y2="45"
        stroke-width="12"
        pathLength="1"
      />
      <line
        class="draw draw-2 s2"
        x1="20"
        y1="75"
        x2="45"
        y2="75"
        stroke-width="8"
        pathLength="1"
      />
      <path
        class="draw draw-3 s3"
        d="M 50 70 C 70 70, 75 35, 105 30"
        stroke-width="9"
        fill="none"
        pathLength="1"
      />
      <path
        class="draw draw-4 s4"
        d="M 65 90 C 85 90, 90 55, 115 50"
        stroke-width="4"
        fill="none"
        pathLength="1"
      />
    </g>
  </svg>
</template>

<style scoped>
.logo {
  --docs-islands-logo-glow: drop-shadow(0 0 14px rgb(129 140 248 / 0.38));
  --docs-islands-logo-stroke-1: #646cff;
  --docs-islands-logo-stroke-2: #41d1ff;
  --docs-islands-logo-stroke-3: #747bff;
  --docs-islands-logo-stroke-4: #a855f7;

  display: block;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  margin-right: 8px;
  overflow: visible;
  transform-origin: center;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}

:global(.dark) .logo {
  --docs-islands-logo-glow: drop-shadow(0 0 14px rgb(129 140 248 / 0.44));
  --docs-islands-logo-stroke-1: #818cf8;
  --docs-islands-logo-stroke-2: #38bdf8;
  --docs-islands-logo-stroke-3: #c4b5fd;
  --docs-islands-logo-stroke-4: #e879f9;
}

.s1 {
  stroke: var(--docs-islands-logo-stroke-1);
}

.s2 {
  stroke: var(--docs-islands-logo-stroke-2);
}

.s3 {
  stroke: var(--docs-islands-logo-stroke-3);
}

.s4 {
  stroke: var(--docs-islands-logo-stroke-4);
}

:global(.dark) .logo-group {
  filter: url(#docs-islands-vitepress-nav-glow) var(--docs-islands-logo-glow);
}

.logo-group {
  transform-box: fill-box;
  transform-origin: center;
  animation: logo-breathe 4.8s ease-in-out infinite;
  will-change: transform;
}

.draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  opacity: 0.3;
  animation: draw-cycle 4.2s cubic-bezier(0.22, 1, 0.36, 1) infinite;
  transition: stroke 0.3s ease;
}

.draw-1 {
  animation-delay: 0s;
}

.draw-2 {
  animation-delay: 0.18s;
}

.draw-3 {
  animation-delay: 0.36s;
}

.draw-4 {
  animation-delay: 0.54s;
}

@keyframes draw-cycle {
  0% {
    stroke-dashoffset: 1;
    opacity: 0.25;
  }

  18%,
  72% {
    stroke-dashoffset: 0;
    opacity: 1;
  }

  100% {
    stroke-dashoffset: -1;
    opacity: 0.35;
  }
}

@keyframes logo-breathe {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }

  50% {
    transform: translateY(-1px) scale(1.035);
  }
}

@media (prefers-reduced-motion: reduce) {
  .logo-group,
  .draw {
    animation: none;
  }

  .draw {
    opacity: 1;
    stroke-dashoffset: 0;
  }
}
</style>
