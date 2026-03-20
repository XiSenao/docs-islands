import type React from 'react';

export interface ManagedReactRoot {
  render(children: React.ReactNode): void;
}

interface ManagedReactRenderState {
  component: React.ComponentType<Record<string, string>>;
  root: ManagedReactRoot;
}

const reactRenderRootStore = new WeakMap<Element, ManagedReactRenderState>();

export const rememberReactRenderState = (
  element: Element,
  root: ManagedReactRoot,
  component: React.ComponentType<Record<string, string>>,
): void => {
  reactRenderRootStore.set(element, {
    component,
    root,
  });
};

export const getReactRenderRoot = (
  element: Element,
): ManagedReactRoot | undefined => reactRenderRootStore.get(element)?.root;

export const getReactRenderedComponent = (
  element: Element,
): React.ComponentType<Record<string, string>> | undefined =>
  reactRenderRootStore.get(element)?.component;
