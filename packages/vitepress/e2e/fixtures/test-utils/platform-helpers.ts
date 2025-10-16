/**
 * Platform-specific test utilities for handling Windows CI issues
 */

import { expect, type Locator, type Page } from '@playwright/test';

export const isWindows: boolean = process.platform === 'win32';
export const isCI: boolean = Boolean(process.env.CI);

/**
 * Platform-aware timeout values
 */
export const TIMEOUTS = {
  DEFAULT: 30_000,
  WINDOWS_CI: 90_000,
  ELEMENT_WAIT: (isWindows && isCI ? 60_000 : 30_000) as number,
  PAGE_LOAD: (isWindows && isCI ? 45_000 : 15_000) as number,
} as const;

/**
 * Enhanced element waiting with platform-specific retry logic
 */
export async function waitForElementRobust(
  page: Page,
  selector: string,
  options: {
    checkAttribute?: string;
    expectedAttributeValue?: string | null;
    checkVisibility?: boolean;
    timeout?: number;
  } = {},
): Promise<Locator> {
  const {
    checkAttribute,
    expectedAttributeValue,
    checkVisibility = true,
    timeout = TIMEOUTS.ELEMENT_WAIT,
  } = options;

  const element = page.locator(selector);

  // Step 1: Wait for element to exist in DOM
  await expect(element).toBeAttached({ timeout });

  // Step 2: Check attribute if specified (more reliable than visibility)
  if (checkAttribute && expectedAttributeValue) {
    await expect(async () => {
      const attrValue = await element.getAttribute(checkAttribute);
      expect(attrValue).toBe(expectedAttributeValue);
    }).toPass({
      timeout,
      intervals: isWindows && isCI ? [2000, 3000] : [1000],
    });
  }

  // Step 3: Check visibility if required (with retry logic for Windows)
  if (checkVisibility) {
    await (isWindows && isCI
      ? expect(async () => {
          await expect(element).toBeVisible();
        }).toPass({
          timeout,
          intervals: [3000, 5000],
        })
      : expect(element).toBeVisible({ timeout: timeout / 2 }));
  }

  return element;
}

/**
 * Debug helper for CI failures
 */
export async function debugElementState(
  page: Page,
  selector: string,
  label: string = 'Element',
): Promise<void> {
  if (!isCI) return;

  try {
    const element = page.locator(selector);
    const isAttached = await element
      .count()
      .then((count) => count > 0)
      .catch(() => false);
    const isVisible = await element.isVisible().catch(() => false);
    const attributes = await element
      .evaluateAll((els) =>
        els.map((el) => ({
          tag: el.tagName,
          attributes: JSON.stringify(
            Object.fromEntries(
              [...el.attributes].map((attr) => [attr.name, attr.value]),
            ),
          ),
          textContent: el.textContent?.slice(0, 100),
        })),
      )
      .catch(() => []);

    console.log(`[DEBUG] ${label} (${selector}):`, {
      platform: process.platform,
      isAttached,
      isVisible,
      elements: attributes.length,
      details: attributes,
    });
  } catch (error) {
    console.log(`[DEBUG] ${label} debug failed:`, error);
  }
}
