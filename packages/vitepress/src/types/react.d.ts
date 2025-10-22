import type React from 'react';
import type { PageMetafile } from './page';

/**
 * Base component information
 */
interface BaseComponentInfo {
  component: React.ComponentType<Record<string, string>> | null;
}

/**
 * Development mode component information
 */
export interface DevComponentInfo extends BaseComponentInfo {
  path: string;
  importedName: string;
}

/**
 * Production mode component information
 */
export type ProdComponentInfo = BaseComponentInfo;

/**
 * React component injection type
 */
export type ReactInjectComponent = Record<
  string,
  Record<string, DevComponentInfo | ProdComponentInfo>
>;

/**
 * ReactComponentManager - Manages React component lifecycle, loading, and registration
 *
 * This class handles:
 * - Component registration and lazy-loading
 * - React library initialization (dev/prod modes)
 * - Page-level component metadata management
 * - Component subscription and notification patterns
 * - CSS and script injection for component dependencies
 */
export interface ReactComponentManager {
  /**
   * Initialize the component manager in development mode
   * - Sets up component manager and global components
   * - Enables HMR (Hot Module Replacement) support
   * - Does not preload metafile (uses lazy loading)
   */
  initializeInDev(): Promise<void>;

  /**
   * Initialize the component manager in production mode
   * - Sets up component manager and global components
   * - Loads global metafile for all pages (except in MPA mode)
   * - Enables preloading optimizations
   */
  initializeInProd(): Promise<void>;

  /**
   * Lazy-load React and ReactDOM libraries
   * @returns Promise resolving to true if React loaded successfully
   * @throws Error if loading fails or not in browser environment
   */
  loadReact(): Promise<boolean>;

  /**
   * Get all initial module preload scripts across all pages
   * Used for preloading optimization strategy
   * @returns Array of script URLs (loaderScript + ssrInjectScript)
   */
  getAllInitialModulePreloadScripts(): string[];

  /**
   * Get component metadata for a specific page
   * @param pathname - Page pathname (will unwrap base URL if present)
   * @returns PageMetafile or null if page not found
   */
  getPageComponentInfo(pathname: string): PageMetafile | null;

  /**
   * Load all components for the current page
   * - Manages CSS bundle injection (add/remove/reorder)
   * - Loads component scripts with proper preloading
   * - Handles script execution lifecycle
   * @returns Promise resolving to true if components loaded successfully
   */
  loadPageComponents(): Promise<boolean>;

  /**
   * Subscribe to component loading notification
   * Creates a promise that resolves when the component is loaded
   * @param pageId - Page identifier
   * @param componentName - Component name to subscribe to
   * @param timeout - Subscription timeout in milliseconds (default: 10000)
   * @returns Promise resolving when component is loaded
   * @throws Error if subscription times out or component fails to load
   */
  subscribeComponent(
    pageId: string,
    componentName: string,
    timeout?: number,
  ): Promise<boolean>;

  /**
   * Notify that a component has been loaded and registered
   * Resolves all pending subscriptions for this component
   * @param pageId - Page identifier
   * @param componentName - Component name that was loaded
   */
  notifyComponentLoaded(pageId: string, componentName: string): void;

  /**
   * Notify that multiple components have been loaded
   * Batch operation for notifying multiple components at once
   * @param pageId - Page identifier
   * @param componentNames - Array of component names that were loaded
   */
  notifyComponentsLoaded(pageId: string, componentNames: string[]): void;

  /**
   * Check if a component has been loaded
   * @param key - Component key in format "{pageId}-{componentName}"
   * @returns true if component is loaded, false otherwise
   */
  isComponentLoaded(key: string): boolean;

  /**
   * Get a loaded component by pageId and componentName
   * @param pageId - Page identifier
   * @param componentName - Component name
   * @returns React component or null if not found
   */
  getComponent(
    pageId: string,
    componentName: string,
  ): React.ComponentType<Record<string, string>> | null;

  /**
   * Clear all pending subscriptions for a specific page
   * Used during page navigation to cancel previous page's subscriptions
   * @param pageId - Page identifier
   */
  clearPageSubscriptions(pageId: string): void;

  /**
   * Reset the component manager state
   * - Rejects all pending subscriptions
   * - Clears loaded components cache
   * - Maintains initialization state and React loading state
   */
  reset(): void;

  /**
   * Completely destroy the component manager
   * - Calls reset() to clear subscriptions and components
   * - Resets all internal state including initialization flags
   * - Clears page metafile data
   */
  destroy(): void;

  /**
   * Check if React is fully loaded and available
   * @returns true if React and ReactDOM are loaded and functional
   */
  isReactLoaded(): boolean;
}
