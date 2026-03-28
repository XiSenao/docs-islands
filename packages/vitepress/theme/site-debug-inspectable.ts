const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_DEPTH = 5;
const MAX_OBJECT_KEYS = 40;

const getOwnPropertyEntries = (value: object) => {
  const propertyNames = Object.getOwnPropertyNames(value);
  const propertySymbols = Object.getOwnPropertySymbols(value);

  return [...propertyNames, ...propertySymbols]
    .slice(0, MAX_OBJECT_KEYS)
    .map((key) => {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);

        if (!descriptor) {
          return [String(key), '[Unknown]'] as const;
        }

        if ('value' in descriptor) {
          return [String(key), descriptor.value] as const;
        }

        if (descriptor.get && descriptor.set) {
          return [String(key), '[Getter/Setter]'] as const;
        }

        if (descriptor.get) {
          return [String(key), '[Getter]'] as const;
        }

        if (descriptor.set) {
          return [String(key), '[Setter]'] as const;
        }

        return [String(key), '[Property]'] as const;
      } catch (error) {
        return [
          String(key),
          error instanceof Error ? `[Thrown: ${error.message}]` : '[Thrown]',
        ] as const;
      }
    });
};

const getObjectKeys = (value: object) => {
  try {
    return Object.keys(value);
  } catch {
    return [];
  }
};

export const formatForDisplay = (
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): string => {
  if (value === undefined) {
    return 'undefined';
  }

  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return depth === 0 ? value : JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return `[Function${value.name ? `: ${value.name}` : ''}]`;
  }

  if (value instanceof Error) {
    return (
      `${value.name}: ${value.message}` +
      (value.stack ? `\n${value.stack}` : '')
    );
  }

  if (typeof Element !== 'undefined' && value instanceof HTMLImageElement) {
    return (
      'HTMLImageElement ' +
      formatForDisplay(
        {
          alt: value.alt,
          className: value.className,
          complete: value.complete,
          currentSrc: value.currentSrc || value.src,
          naturalHeight: value.naturalHeight,
          naturalWidth: value.naturalWidth,
        },
        depth + 1,
        seen,
      )
    );
  }

  if (typeof Element !== 'undefined' && value instanceof HTMLElement) {
    return (
      `${value.tagName.toLowerCase()} ` +
      formatForDisplay(
        {
          className: value.className,
          id: value.id,
          text: value.textContent?.slice(0, 120) ?? '',
        },
        depth + 1,
        seen,
      )
    );
  }

  if (value instanceof Date) {
    return `Date ${JSON.stringify(value.toISOString())}`;
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (value instanceof Promise) {
    return 'Promise { <pending> }';
  }

  if (value instanceof Map) {
    const valueEntries = Array.from(value.entries()).slice(0, MAX_ARRAY_ITEMS);
    const body = valueEntries
      .map(
        ([key, entryValue]) =>
          `${formatForDisplay(key, depth + 1, seen)} => ${formatForDisplay(
            entryValue,
            depth + 1,
            seen,
          )}`,
      )
      .join(', ');
    const suffix = value.size > valueEntries.length ? ', ...' : '';
    return `Map(${value.size}) { ${body}${suffix} }`;
  }

  if (value instanceof Set) {
    const valueEntries = Array.from(value.values()).slice(0, MAX_ARRAY_ITEMS);
    const body = valueEntries
      .map((entryValue) => formatForDisplay(entryValue, depth + 1, seen))
      .join(', ');
    const suffix = value.size > valueEntries.length ? ', ...' : '';
    return `Set(${value.size}) { ${body}${suffix} }`;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    if (depth >= MAX_OBJECT_DEPTH) {
      return `[Array(${value.length})]`;
    }

    const items = value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => formatForDisplay(item, depth + 1, seen));
    const suffix = value.length > items.length ? ', ...' : '';
    return `[${items.join(', ')}${suffix}]`;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    const constructorName =
      (value as { constructor?: { name?: string } }).constructor?.name ??
      'Object';

    if (typeof window !== 'undefined' && value === window) {
      return (
        'Window ' +
        formatForDisplay({ href: window.location.href }, depth + 1, seen)
      );
    }

    if (typeof document !== 'undefined' && value === document) {
      return (
        'Document ' +
        formatForDisplay(
          {
            readyState: document.readyState,
            visibility: document.visibilityState,
          },
          depth + 1,
          seen,
        )
      );
    }

    if (depth >= MAX_OBJECT_DEPTH) {
      return constructorName === 'Object'
        ? '{ ... }'
        : `${constructorName} { ... }`;
    }

    const ownEntries = getOwnPropertyEntries(value);
    const body = ownEntries
      .map(
        ([key, entryValue]) =>
          `${key}: ${formatForDisplay(entryValue, depth + 1, seen)}`,
      )
      .join(', ');
    const totalKeyCount = Reflect.ownKeys(value).length;
    const suffix = totalKeyCount > ownEntries.length ? ', ...' : '';

    if (constructorName === 'Object') {
      return `{ ${body}${suffix} }`;
    }

    return `${constructorName} { ${body}${suffix} }`;
  }

  return String(value);
};

export const isInspectableRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const serializePayload = (payload: unknown): string | undefined => {
  if (payload === undefined) {
    return undefined;
  }

  return formatForDisplay(payload);
};

export const normalizeConsoleArgs = (args: unknown[]) => {
  if (args.length <= 1) {
    return args[0];
  }

  return args;
};

export const normalizeGlobalPath = (path: string) => {
  const trimmed = path.trim();

  if (!trimmed || trimmed === 'window') {
    return '';
  }

  return trimmed.replace(/^window\./, '');
};

export const getPropertyValue = (value: unknown, token: string): unknown => {
  if (Array.isArray(value) && /^\d+$/.test(token)) {
    return value[Number(token)];
  }

  if (value && (typeof value === 'object' || typeof value === 'function')) {
    return (value as Record<string, unknown>)[token];
  }

  return undefined;
};

export const serializeInspectable = (
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown => {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return {
      __type: 'function',
      keys: getObjectKeys(value).slice(0, MAX_OBJECT_KEYS),
      name: value.name || '(anonymous)',
    };
  }

  if (value instanceof Error) {
    return {
      __type: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof Element !== 'undefined' && value instanceof HTMLImageElement) {
    return {
      __type: 'HTMLImageElement',
      alt: value.alt,
      className: value.className,
      complete: value.complete,
      currentSrc: value.currentSrc || value.src,
      naturalHeight: value.naturalHeight,
      naturalWidth: value.naturalWidth,
    };
  }

  if (typeof Element !== 'undefined' && value instanceof HTMLElement) {
    return {
      __type: value.tagName.toLowerCase(),
      className: value.className,
      id: value.id,
      text: value.textContent?.slice(0, 120) ?? '',
    };
  }

  if (value instanceof Map) {
    return {
      __type: 'Map',
      entries: Array.from(value.entries())
        .slice(0, MAX_ARRAY_ITEMS)
        .map(([key, entryValue]) => [
          String(key),
          serializeInspectable(entryValue, depth + 1, seen),
        ]),
      size: value.size,
    };
  }

  if (value instanceof Set) {
    return {
      __type: 'Set',
      size: value.size,
      values: Array.from(value.values())
        .slice(0, MAX_ARRAY_ITEMS)
        .map((entryValue) => serializeInspectable(entryValue, depth + 1, seen)),
    };
  }

  if (Array.isArray(value)) {
    return {
      __type: 'Array',
      items: value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((entryValue) => serializeInspectable(entryValue, depth + 1, seen)),
      length: value.length,
      truncated: Math.max(value.length - MAX_ARRAY_ITEMS, 0),
    };
  }

  if (value instanceof Promise) {
    return {
      __type: 'Promise',
    };
  }

  if (typeof window !== 'undefined' && value === window) {
    return {
      __type: 'Window',
      href: window.location.href,
      keys: getObjectKeys(window).slice(0, MAX_OBJECT_KEYS),
    };
  }

  if (typeof document !== 'undefined' && value === document) {
    return {
      __type: 'Document',
      readyState: document.readyState,
      visibility: document.visibilityState,
    };
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value)) {
    return {
      __type:
        (value as { constructor?: { name?: string } }).constructor?.name ??
        'Object',
      circular: true,
    };
  }

  seen.add(value);

  const constructorName =
    (value as { constructor?: { name?: string } }).constructor?.name ??
    'Object';
  const keys = getObjectKeys(value).slice(0, MAX_OBJECT_KEYS);

  if (depth >= MAX_OBJECT_DEPTH) {
    return {
      __type: constructorName,
      keys,
      truncated: true,
    };
  }

  const snapshot: Record<string, unknown> =
    constructorName === 'Object'
      ? {}
      : {
          __type: constructorName,
        };

  for (const key of keys) {
    try {
      snapshot[key] = serializeInspectable(
        (value as Record<string, unknown>)[key],
        depth + 1,
        seen,
      );
    } catch (error) {
      snapshot[key] = {
        __type: 'UnreadableProperty',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const totalKeys = getObjectKeys(value).length;

  if (totalKeys > keys.length) {
    snapshot.__truncatedKeys = totalKeys - keys.length;
  }

  return snapshot;
};

export const getInspectableNodeType = (value: unknown) => {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (isInspectableRecord(value) && typeof value.__type === 'string') {
    return value.__type;
  }

  if (Array.isArray(value)) {
    return 'Array';
  }

  if (typeof value === 'string') {
    return 'string';
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return typeof value;
  }

  if (typeof value === 'symbol') {
    return 'symbol';
  }

  if (typeof value === 'function') {
    return 'function';
  }

  if (typeof value === 'object') {
    return 'Object';
  }

  return typeof value;
};

export const getInspectableMeta = (value: unknown) => {
  if (!isInspectableRecord(value)) {
    return [] as string[];
  }

  const meta: string[] = [];
  const inspectableType = getInspectableNodeType(value);

  if (inspectableType === 'Array') {
    const length =
      typeof value.length === 'number'
        ? value.length
        : Array.isArray(value.items)
          ? value.items.length
          : 0;
    meta.push(`${length} items`);
  } else if (
    (inspectableType === 'Map' || inspectableType === 'Set') &&
    typeof value.size === 'number'
  ) {
    meta.push(`${value.size} entries`);
  } else {
    const visibleKeys = Object.keys(value).filter(
      (key) => !key.startsWith('__'),
    );

    if (visibleKeys.length > 0) {
      meta.push(`${visibleKeys.length} keys`);
    }
  }

  if (value.circular) {
    meta.push('circular');
  }

  if (value.truncated) {
    meta.push('truncated');
  }

  if (typeof value.__truncatedKeys === 'number' && value.__truncatedKeys > 0) {
    meta.push(`+${value.__truncatedKeys} hidden keys`);
  }

  return meta;
};

export const resolveGlobalPath = (path: string, root: unknown) => {
  const normalizedPath = normalizeGlobalPath(path);

  if (!normalizedPath) {
    return root;
  }

  const tokens = normalizedPath.match(/[^.[\]]+/g) ?? [];
  let current: unknown = root;

  for (const token of tokens) {
    current = getPropertyValue(current, token);
  }

  return current;
};
