import type { ReactNode } from 'react';

import './css/site-debug-console-docs.css';

type Locale = 'en' | 'zh';

interface ComponentProps {
  locale?: string;
}

interface SignalItem {
  label: string;
  value: string;
}

interface SurfaceCard {
  caption: string;
  items: string[];
  label: string;
  metrics: string[];
  title: string;
}

interface OverviewCopy {
  browserLabel: string;
  entryItems: string[];
  entryLabel: string;
  entrySignals: SignalItem[];
  entryTitle: string;
  kicker: string;
  note: string;
  primaryCard: SurfaceCard;
  secondaryCard: SurfaceCard;
  subtitle: string;
  title: string;
}

interface PanelCardCopy {
  accent: string;
  bestFor: string[];
  bestForLabel: string;
  caption: string;
  metrics: string[];
  note: string;
  shows: string[];
  showsLabel: string;
  summary: string;
  title: string;
}

interface PanelsCopy {
  kicker: string;
  left: PanelCardCopy;
  right: PanelCardCopy;
  subtitle: string;
  title: string;
}

interface WorkflowStep {
  accent: string;
  caption: string;
  items: string[];
  label: string;
  previewLabel: string;
  title: string;
}

interface WorkflowCopy {
  decisions: {
    answer: string;
    question: string;
    tag: string;
  }[];
  decisionsLabel: string;
  kicker: string;
  steps: WorkflowStep[];
  subtitle: string;
  title: string;
}

const normalizeLocale = (locale?: string): Locale =>
  locale === 'zh' ? 'zh' : 'en';

const overviewCopy: Record<Locale, OverviewCopy> = {
  en: {
    browserLabel: 'Site Debug mode is active',
    entryItems: [
      'Enable it with the query entry or the docs logo shortcut.',
      'Once enabled, focus on the page overlay and Debug Logs.',
    ],
    entryLabel: 'Entry',
    entrySignals: [
      {
        label: 'Query',
        value: '?site-debug=1',
      },
      {
        label: 'Shortcut',
        value: 'Top-left logo x3',
      },
      {
        label: 'Feedback',
        value: 'Top toast',
      },
    ],
    entryTitle: 'Turn on debug mode',
    kicker: 'Feature map',
    note: 'Overlay for one component. Debug Logs for page-level runtime.',
    primaryCard: {
      caption: 'Visible container',
      items: [
        'See the resolved mode, status, and timing of the current component.',
        'Open Bundle Composition to tell whether cost comes from Total, JS, CSS, or Asset.',
      ],
      label: 'Page Overlay',
      metrics: ['Render', 'Bundle', 'HMR'],
      title: 'Inspect one component',
    },
    secondaryCard: {
      caption: 'Runtime layer',
      items: [
        'Inspect Injected Globals, Render Metrics, and HMR Metrics in one place.',
        'Export snapshotRuntime() when you need a shareable runtime record.',
      ],
      label: 'Debug Logs',
      metrics: ['Globals', 'Snapshot', 'JSON'],
      title: 'Inspect page runtime',
    },
    subtitle:
      'Keep the mental model simple: inspect the component first, then inspect the runtime behind it.',
    title: 'The key things Site Debug Console helps you see',
  },
  zh: {
    browserLabel: 'Site Debug mode 已开启',
    entryItems: [
      '既可以通过 query 开启，也可以通过文档站 logo 快捷切换。',
      '开启后主要看两块：页面浮层和 Debug Logs。',
    ],
    entryLabel: '入口',
    entrySignals: [
      {
        label: 'Query',
        value: '?site-debug=1',
      },
      {
        label: 'Shortcut',
        value: '左上角 logo x3',
      },
      {
        label: 'Feedback',
        value: '顶部 toast',
      },
    ],
    entryTitle: '开启调试模式',
    kicker: '功能总览',
    note: '页面浮层看单个组件，Debug Logs 看页面级运行时。',
    primaryCard: {
      caption: '页面上的组件',
      items: [
        '直接确认当前组件的实际渲染模式、状态和耗时。',
        '通过 Bundle Composition 判断成本来自 Total、JS、CSS 还是 Asset。',
      ],
      label: '页面浮层',
      metrics: ['Render', 'Bundle', 'HMR'],
      title: '检查单个组件',
    },
    secondaryCard: {
      caption: '全局运行时',
      items: [
        '在一个入口里查看 Injected Globals、Render Metrics 和 HMR Metrics。',
        '需要留痕或共享时，直接导出 snapshotRuntime() 快照。',
      ],
      label: 'Debug Logs',
      metrics: ['Globals', 'Snapshot', 'JSON'],
      title: '检查页面运行时',
    },
    subtitle: '理解方式尽量简单一些：先看组件本身，再看它背后的运行时。',
    title: 'Site Debug Console 最核心能帮助你看清的事',
  },
};

const panelsCopy: Record<Locale, PanelsCopy> = {
  en: {
    kicker: 'Surface split',
    left: {
      accent: 'Page Overlay',
      bestFor: [],
      bestForLabel: 'Best for',
      caption: 'Visible-first diagnosis',
      metrics: ['Status', 'Mode', 'HMR'],
      note: '',
      shows: [
        'Resolved mode, render status, and timing',
        'Latest HMR and Bundle Composition for the current container',
      ],
      showsLabel: 'Core ability',
      summary: '',
      title: 'Page Overlay',
    },
    right: {
      accent: 'Global Debug Console',
      bestFor: [],
      bestForLabel: 'Best for',
      caption: 'Runtime-first diagnosis',
      metrics: ['Globals', 'Metrics', 'Snapshot'],
      note: '',
      shows: [
        'Injected Globals plus live metrics and metafiles',
        'Copyable snapshotRuntime() output for debugging and sharing',
      ],
      showsLabel: 'Core ability',
      summary: '',
      title: 'Debug Logs',
    },
    subtitle:
      'One surface explains a component. The other explains the page runtime.',
    title: 'Two core views',
  },
  zh: {
    kicker: '面板分工',
    left: {
      accent: '页面浮层',
      bestFor: [],
      bestForLabel: '适合排查',
      caption: '从可见症状出发',
      metrics: ['Status', 'Mode', 'HMR'],
      note: '',
      shows: [
        '当前组件的实际渲染模式、状态和耗时',
        '当前容器的 HMR 与 Bundle Composition',
      ],
      showsLabel: '核心能力',
      summary: '',
      title: '页面浮层',
    },
    right: {
      accent: '全局调试控制台',
      bestFor: [],
      bestForLabel: '适合排查',
      caption: '从运行时真相出发',
      metrics: ['Globals', 'Metrics', 'Snapshot'],
      note: '',
      shows: [
        'Injected Globals、指标和 metafile 的实时查看',
        '可复制的 snapshotRuntime() 运行时快照',
      ],
      showsLabel: '核心能力',
      summary: '',
      title: 'Debug Logs',
    },
    subtitle: '一块解释单个组件，一块解释页面级运行时。',
    title: '两个核心视图',
  },
};

const workflowCopy: Record<Locale, WorkflowCopy> = {
  en: {
    decisions: [],
    decisionsLabel: 'Quick decision guide',
    kicker: 'Workflow',
    steps: [
      {
        accent: 'Localize',
        caption: 'Start from the component.',
        items: ['Check status, mode, and total time in the overlay.'],
        label: '1',
        previewLabel: 'Status · Mode',
        title: 'Open the page overlay',
      },
      {
        accent: 'Attribute',
        caption: 'Find the main cost.',
        items: ['Use Total, JS, CSS, and Asset filters in Bundle Composition.'],
        label: '2',
        previewLabel: 'Bundle filters',
        title: 'Use Bundle Composition',
      },
      {
        accent: 'Share',
        caption: 'Save the runtime state.',
        items: ['Open Debug Logs and export snapshotRuntime() when needed.'],
        label: '3',
        previewLabel: 'Snapshot runtime()',
        title: 'Capture the runtime snapshot',
      },
    ],
    subtitle:
      'The usual path is simple: inspect the component, inspect the bundle, then keep a snapshot.',
    title: 'The most common debugging flow',
  },
  zh: {
    decisions: [],
    decisionsLabel: '快速判断路径',
    kicker: '排障流程',
    steps: [
      {
        accent: '定位',
        caption: '先从组件开始。',
        items: ['先在页面浮层里确认状态、模式和总耗时。'],
        label: '1',
        previewLabel: 'Status · Mode',
        title: '打开页面浮层',
      },
      {
        accent: '归因',
        caption: '先确认资源成本。',
        items: ['通过 Total、JS、CSS、Asset 过滤器判断主要开销来源。'],
        label: '2',
        previewLabel: 'Bundle filters',
        title: '使用 Bundle Composition',
      },
      {
        accent: '共享',
        caption: '保存当前运行时状态。',
        items: ['需要留痕或共享时，在 Debug Logs 导出 snapshotRuntime()。'],
        label: '3',
        previewLabel: 'Snapshot runtime()',
        title: '导出运行时快照',
      },
    ],
    subtitle: '最常见的顺序很简单：先看组件，再看包体，最后保存快照。',
    title: '最常用的排障顺序',
  },
};

function DebugDocFrame({
  children,
  kicker,
  subtitle,
  title,
}: {
  children: ReactNode;
  kicker: string;
  subtitle: string;
  title: string;
}) {
  return (
    <section className="site-debug-docs">
      <div className="site-debug-docs__header">
        <p className="site-debug-docs__kicker">{kicker}</p>
        <h3 className="site-debug-docs__title">{title}</h3>
        <p className="site-debug-docs__subtitle">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="site-debug-docs__list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function SignalGrid({ items }: { items: SignalItem[] }) {
  return (
    <div className="site-debug-docs__signal-grid">
      {items.map((item) => (
        <div key={item.label} className="site-debug-docs__signal-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function MetricPills({ active, items }: { active?: string; items: string[] }) {
  return (
    <div className="site-debug-docs__metric-pills">
      {items.map((item) => (
        <span
          key={item}
          className={`site-debug-docs__metric-pill${item === active ? ' is-active' : ''}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function MetaGrid({
  items,
}: {
  items: {
    label: string;
    value: string;
  }[];
}) {
  return (
    <div className="site-debug-docs__meta-grid">
      {items.map((item) => (
        <div key={item.label} className="site-debug-docs__meta-card">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ProgressBar({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="site-debug-docs__progress">
      <div className="site-debug-docs__progress-label">
        <span>{label}</span>
        <strong>{progress}%</strong>
      </div>
      <div className="site-debug-docs__progress-track">
        <span
          className="site-debug-docs__progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function FilterBar({ active }: { active: string }) {
  return (
    <div className="site-debug-docs__filter-bar">
      {['Total', 'JS', 'CSS', 'Asset'].map((item) => (
        <span
          key={item}
          className={`site-debug-docs__filter-pill${item === active ? ' is-active' : ''}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function CodeWindow({
  activeLine,
  lines,
}: {
  activeLine?: number;
  lines: string[];
}) {
  return (
    <div className="site-debug-docs__code-window">
      {lines.map((line, index) => (
        <div
          key={line}
          className={`site-debug-docs__code-line${index === activeLine ? ' is-active' : ''}`}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          <code>{line}</code>
        </div>
      ))}
    </div>
  );
}

function StageSurfacePreview(props: {
  card: SurfaceCard;
  variant: 'overlay' | 'console';
}) {
  if (props.variant === 'overlay') {
    return (
      <article className="site-debug-docs__surface-preview site-debug-docs__surface-preview--overlay">
        <div className="site-debug-docs__surface-head">
          <div>
            <p className="site-debug-docs__surface-caption">
              {props.card.caption}
            </p>
            <h4>{props.card.title}</h4>
          </div>
          <span className="site-debug-docs__chip">{props.card.label}</span>
        </div>
        <MetricPills active="Render" items={props.card.metrics} />
        <MetaGrid
          items={[
            {
              label: 'status',
              value: 'Completed',
            },
            {
              label: 'mode',
              value: 'ssr:only',
            },
            {
              label: 'hmr',
              value: '84ms',
            },
          ]}
        />
        <ProgressBar label="Resource loading" progress={72} />
        <FilterBar active="Total" />
        <BulletList items={props.card.items} />
      </article>
    );
  }

  return (
    <article className="site-debug-docs__surface-preview site-debug-docs__surface-preview--console">
      <div className="site-debug-docs__surface-head">
        <div>
          <p className="site-debug-docs__surface-caption">
            {props.card.caption}
          </p>
          <h4>{props.card.title}</h4>
        </div>
        <span className="site-debug-docs__chip">{props.card.label}</span>
      </div>
      <MetricPills active="Snapshot" items={props.card.metrics} />
      <CodeWindow
        activeLine={2}
        lines={[
          'window.__DOCS_ISLANDS__',
          'renderMetrics.currentPage',
          'snapshotRuntime()',
        ]}
      />
      <BulletList items={props.card.items} />
    </article>
  );
}

function PanelPreview(props: {
  metrics: string[];
  variant: 'overlay' | 'console';
}) {
  if (props.variant === 'overlay') {
    return (
      <div className="site-debug-docs__panel-preview">
        <MetricPills active="Status" items={props.metrics} />
        <MetaGrid
          items={[
            {
              label: 'status',
              value: 'Rendering',
            },
            {
              label: 'mode',
              value: 'spa:sr',
            },
            {
              label: 'bundle',
              value: '156kb',
            },
          ]}
        />
        <ProgressBar label="Chunk resources" progress={61} />
        <FilterBar active="CSS" />
      </div>
    );
  }

  return (
    <div className="site-debug-docs__panel-preview">
      <MetricPills active="Snapshot" items={props.metrics} />
      <CodeWindow
        activeLine={1}
        lines={[
          'pageMetafile.routes["/site-debug-console"]',
          'hmrMetrics.latestSession',
          'snapshotRuntime().renderMetrics',
        ]}
      />
    </div>
  );
}

function StepPreview(props: { index: number; label: string }) {
  if (props.index === 0) {
    return (
      <div className="site-debug-docs__step-visual">
        <p className="site-debug-docs__step-preview-label">{props.label}</p>
        <MetaGrid
          items={[
            {
              label: 'status',
              value: 'Waiting',
            },
            {
              label: 'mode',
              value: 'client:load',
            },
          ]}
        />
        <ProgressBar label="Visible wait" progress={43} />
      </div>
    );
  }

  if (props.index === 1) {
    return (
      <div className="site-debug-docs__step-visual">
        <p className="site-debug-docs__step-preview-label">{props.label}</p>
        <FilterBar active="JS" />
        <MetaGrid
          items={[
            {
              label: 'main',
              value: '92kb',
            },
            {
              label: 'css',
              value: '18kb',
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="site-debug-docs__step-visual">
      <p className="site-debug-docs__step-preview-label">{props.label}</p>
      <CodeWindow
        activeLine={0}
        lines={[
          'snapshotRuntime()',
          '{ renderMetrics, hmrMetrics }',
          'copy(snapshot)',
        ]}
      />
    </div>
  );
}

export function SiteDebugConsoleOverview(props: ComponentProps) {
  const copy = overviewCopy[normalizeLocale(props.locale)];

  return (
    <DebugDocFrame
      kicker={copy.kicker}
      subtitle={copy.subtitle}
      title={copy.title}
    >
      <div className="site-debug-docs__hero">
        <article className="site-debug-docs__entry-card">
          <div className="site-debug-docs__entry-head">
            <span className="site-debug-docs__chip">{copy.entryLabel}</span>
          </div>
          <h4>{copy.entryTitle}</h4>
          <BulletList items={copy.entryItems} />
          <SignalGrid items={copy.entrySignals} />
        </article>

        <div className="site-debug-docs__stage">
          <div className="site-debug-docs__browser-bar">
            <div className="site-debug-docs__browser-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>{copy.browserLabel}</p>
            <MetricPills items={['Overlay', 'Debug Logs', 'Bundle']} />
          </div>

          <div className="site-debug-docs__stage-canvas">
            <StageSurfacePreview card={copy.primaryCard} variant="overlay" />
            <StageSurfacePreview card={copy.secondaryCard} variant="console" />
            <p className="site-debug-docs__stage-note">{copy.note}</p>
          </div>
        </div>
      </div>
    </DebugDocFrame>
  );
}

export function SiteDebugConsolePanels(props: ComponentProps) {
  const copy = panelsCopy[normalizeLocale(props.locale)];

  return (
    <DebugDocFrame
      kicker={copy.kicker}
      subtitle={copy.subtitle}
      title={copy.title}
    >
      <div className="site-debug-docs__panel-grid">
        {[
          {
            ...copy.left,
            variant: 'overlay' as const,
          },
          {
            ...copy.right,
            variant: 'console' as const,
          },
        ].map((panel) => (
          <article key={panel.title} className="site-debug-docs__panel-card">
            <div className="site-debug-docs__panel-head">
              <div>
                <p className="site-debug-docs__surface-caption">
                  {panel.caption}
                </p>
                <h4>{panel.title}</h4>
              </div>
              <span className="site-debug-docs__chip">{panel.accent}</span>
            </div>

            <PanelPreview metrics={panel.metrics} variant={panel.variant} />

            <div className="site-debug-docs__panel-section">
              <p className="site-debug-docs__section-label">
                {panel.showsLabel}
              </p>
              <BulletList items={panel.shows} />
            </div>
          </article>
        ))}
      </div>
    </DebugDocFrame>
  );
}

export function SiteDebugConsoleWorkflow(props: ComponentProps) {
  const copy = workflowCopy[normalizeLocale(props.locale)];

  return (
    <DebugDocFrame
      kicker={copy.kicker}
      subtitle={copy.subtitle}
      title={copy.title}
    >
      <div className="site-debug-docs__workflow">
        <div className="site-debug-docs__steps">
          {copy.steps.map((step, index) => (
            <article key={step.title} className="site-debug-docs__step-card">
              <div className="site-debug-docs__step-head">
                <span className="site-debug-docs__step-index">
                  {step.label}
                </span>
                <span className="site-debug-docs__chip">{step.accent}</span>
              </div>

              <StepPreview index={index} label={step.previewLabel} />

              <p className="site-debug-docs__surface-caption">{step.caption}</p>
              <h4>{step.title}</h4>
              <BulletList items={step.items} />
            </article>
          ))}
        </div>
      </div>
    </DebugDocFrame>
  );
}
