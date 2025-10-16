import { expect } from '@playwright/test';

const waitForVitePressContentRender = async () => {
  await page.waitForFunction(() => {
    return (
      document.querySelector('.vp-doc') !== null &&
      document.querySelector('.vp-doc')!.textContent!.length > 0
    );
  });
};

describe('Container Changes', () => {
  describe('Client Only Containers', () => {
    let consoleMessages: string[] = [];

    beforeEach(async () => {
      // Clear previous console messages.
      consoleMessages = [];

      // Listen for console messages.
      page.on('console', (msg) => {
        consoleMessages.push(msg.text());
      });

      await goto('/container-changes/client-only');
    });

    afterEach(() => {
      // Clean up event listeners.
      page.removeAllListeners('console');
    });

    test('should render client:only components correctly', async () => {
      const clientOnlyContainer = '[__render_directive__="client:only"]';
      const componentSelector = '[data-testid="hello-world"]';
      const buttonSelector = '[data-testid="counter-button"]';

      await page.waitForSelector(clientOnlyContainer);

      // Wait for component rendering to complete (whether client-side or server-side rendering).
      const helloWorldComponent = page.locator(componentSelector);
      await expect(helloWorldComponent).toBeVisible();

      // Wait for a period to ensure console messages are output.
      await page.waitForTimeout(1000);

      // Verify if the console outputs client-side rendering completion messages.
      const hasClientRenderingMessage = consoleMessages.some((msg) =>
        msg.includes('Component HelloWorld client-side rendering completed'),
      );
      expect(hasClientRenderingMessage).toBe(true);

      // Verify that basic messages also exist.
      const hasInitializationMessage = consoleMessages.some((msg) =>
        msg.includes('Initialization completed'),
      );
      const hasRuntimeMessage = consoleMessages.some((msg) =>
        msg.includes('Development render runtime loaded successfully'),
      );
      expect(hasInitializationMessage).toBe(true);
      expect(hasRuntimeMessage).toBe(true);

      // Verify that interactive components exist and are visible.
      const counterButton = helloWorldComponent.locator(buttonSelector);
      await expect(counterButton).toBeVisible();

      // Test button interaction functionality.
      await counterButton.click();
      await expect(counterButton).toHaveText(/Count: 1/);

      await counterButton.click();
      await expect(counterButton).toHaveText(/Count: 2/);
    });

    test('should validate client:only console messages', async () => {
      const clientOnlyContainer = '[__render_directive__="client:only"]';

      // Wait for container and component loading.
      await page.waitForSelector(clientOnlyContainer);
      await page.waitForTimeout(1500);

      // Verify if there are client-side rendering related messages.
      const clientRenderingMessages = consoleMessages.filter(
        (msg) =>
          msg.toLowerCase().includes('client-side rendering') ||
          msg.toLowerCase().includes('client-side') ||
          msg.toLowerCase().includes('rendering completed'),
      );

      expect(clientRenderingMessages.length).toBeGreaterThan(0);
    });
  });

  describe('SSR Only Containers(Default Behavior)', () => {
    let consoleMessages: string[] = [];

    beforeEach(async () => {
      // Clear previous console messages.
      consoleMessages = [];

      // Listen for console messages.
      page.on('console', (msg) => {
        consoleMessages.push(msg.text());
      });

      await goto('/container-changes/ssr-only');
      await waitForVitePressContentRender();
    });

    afterEach(() => {
      // Clean up event listeners.
      page.removeAllListeners('console');
    });

    test('should not be interactive for only ssr:only components', async () => {
      const uniqueIdList = ['ssr-only-1', 'default-unique-id', 'ssr-only-2'];
      const relatedDoms = uniqueIdList.map((uniqueId) =>
        page.locator(`[data-unique-id="${uniqueId}"]`),
      );
      await Promise.all(
        relatedDoms.map(async (dom) => {
          return expect(dom).toBeVisible();
        }),
      );

      // Wait for a period to ensure console messages are output
      await page.waitForTimeout(1000);

      // Verify basic initialization and runtime loading messages (all rendering strategies have these)
      const hasInitializationMessage = consoleMessages.some((msg) =>
        msg.includes('Initialization completed'),
      );
      const hasRuntimeMessage = consoleMessages.some((msg) =>
        msg.includes('Development render runtime loaded successfully'),
      );

      expect(hasInitializationMessage).toBe(true);
      expect(hasRuntimeMessage).toBe(true);

      // Verify SSR:only characteristics: no client-side rendering or hydration messages
      const hasClientRenderingMessage = consoleMessages.some(
        (msg) =>
          msg.includes('client-side rendering completed') ||
          msg.includes('hydration completed'),
      );
      expect(hasClientRenderingMessage).toBe(false);

      for (const dom of relatedDoms) {
        await dom.click();
        expect(await dom.textContent()).toContain('Count: 0');
      }
    });

    test('should validate ssr:only console messages', async () => {
      // Wait for page loading to complete.
      await page.waitForTimeout(1500);

      // Verify that basic messages exist (all rendering strategies have these).
      const initializationMessages = consoleMessages.filter(
        (msg) =>
          msg.toLowerCase().includes('initialization completed') ||
          msg
            .toLowerCase()
            .includes('development render runtime loaded successfully'),
      );

      // Verify SSR:only characteristics: only basic messages, no client-interaction-related messages.
      const clientInteractionMessages = consoleMessages.filter(
        (msg) =>
          msg.toLowerCase().includes('hydration completed') ||
          msg.toLowerCase().includes('client-side rendering completed'),
      );

      expect(initializationMessages.length).toBeGreaterThan(0);
      expect(clientInteractionMessages.length).toBe(0);
    });
  });

  describe('Client Load Containers', () => {
    let consoleMessages: string[] = [];

    beforeEach(async () => {
      // Clear previous console messages.
      consoleMessages = [];

      // Listen for console messages.
      page.on('console', (msg) => {
        consoleMessages.push(msg.text());
      });

      await goto('/container-changes/client-load');
    });

    afterEach(() => {
      // Clean up event listeners.
      page.removeAllListeners('console');
    });

    test('should load client:load components with runtime output and interactive functionality', async () => {
      const clientLoadContainer = '[__render_directive__="client:load"]';
      const componentSelector = '[data-testid="hello-world"]';
      const buttonSelector = '[data-testid="counter-button"]';

      // Wait for the container to appear.
      await page.waitForSelector(clientLoadContainer);

      // Wait for component rendering to complete.
      const helloWorldComponent = page.locator(componentSelector);
      await page.waitForSelector(componentSelector);
      await expect(helloWorldComponent).toBeVisible();

      // Wait for a period to ensure console messages are output.
      await page.waitForTimeout(1000);

      // Verify client:load-specific hydration completion messages.
      const hasHydrationMessage = consoleMessages.some((msg) =>
        msg.includes('Component HelloWorld hydration completed'),
      );
      expect(hasHydrationMessage).toBe(true);

      // Verify that basic messages also exist (all rendering strategies have these).
      const hasInitializationMessage = consoleMessages.some((msg) =>
        msg.includes('Initialization completed'),
      );
      const hasRuntimeMessage = consoleMessages.some((msg) =>
        msg.includes('Development render runtime loaded successfully'),
      );
      expect(hasInitializationMessage).toBe(true);
      expect(hasRuntimeMessage).toBe(true);

      // Verify that interactive components exist and are visible.
      const counterButton = page.locator(buttonSelector);
      await page.waitForSelector(buttonSelector);
      await expect(counterButton).toBeVisible();

      // Ensure the button initial state is Count: 0.
      await expect(counterButton).toHaveText(/Count: 0/);

      // Test button interaction functionality — verify count increases.
      await counterButton.click();
      await expect(counterButton).toHaveText(/Count: 1/);

      await counterButton.click();
      await expect(counterButton).toHaveText(/Count: 2/);

      await counterButton.click();
      await expect(counterButton).toHaveText(/Count: 3/);
    });

    test('should handle console message validation robustly', async () => {
      const clientLoadContainer = '[__render_directive__="client:load"]';

      // Wait for container and component loading
      await page.waitForSelector(clientLoadContainer);
      await page.waitForTimeout(1500); // Give more time to ensure all messages are captured

      // Verify if there are runtime-related messages
      const runtimeRelatedMessages = consoleMessages.filter(
        (msg) =>
          msg.toLowerCase().includes('runtime') ||
          msg.toLowerCase().includes('loaded') ||
          msg.toLowerCase().includes('development'),
      );

      expect(runtimeRelatedMessages.length).toBeGreaterThan(0);
    });
  });

  describe('Client Visible Containers', () => {
    let consoleMessages: string[] = [];

    beforeEach(async () => {
      // Clear previous console messages.
      consoleMessages = [];

      // Listen for console messages.
      page.on('console', (msg) => {
        consoleMessages.push(msg.text());
      });

      await goto('/container-changes/client-visible');
    });

    afterEach(() => {
      // Clean up event listeners.
      page.removeAllListeners('console');
    });

    test('should initially show only basic messages before scrolling', async () => {
      // Wait for initial page loading to complete.
      await page.waitForTimeout(1000);

      // Verify that the initial state only has basic messages.
      const hasInitializationMessage = consoleMessages.some((msg) =>
        msg.includes('Initialization completed'),
      );
      const hasRuntimeMessage = consoleMessages.some((msg) =>
        msg.includes('Development render runtime loaded successfully'),
      );

      expect(hasInitializationMessage).toBe(true);
      expect(hasRuntimeMessage).toBe(true);

      // Verify that the initial state has no lazy-loading hydration messages.
      const hasLazyHydrationMessage = consoleMessages.some((msg) =>
        msg.includes('lazy hydration completed'),
      );
      expect(hasLazyHydrationMessage).toBe(false);
    });

    test('should trigger first component hydration when scrolled into view', async () => {
      // Wait for page loading to complete.
      await page.waitForTimeout(1000);

      // Clear previous messages, focusing on post-scroll messages.
      consoleMessages = [];

      // Scroll to the middle position to make the first component visible.
      await page.evaluate(() => {
        window.scrollTo(0, 900); // Scroll to middle position
      });

      // Wait for component hydration to complete.
      await page.waitForTimeout(2000);

      // Verify the first component's lazy-loading hydration messages.
      const hasFirstLazyHydrationMessage = consoleMessages.some((msg) =>
        msg.includes('Component HelloWorld lazy hydration completed'),
      );
      expect(hasFirstLazyHydrationMessage).toBe(true);

      // Verify the first component is visible and interactive.
      const firstComponent = page.locator('[data-testid="first-component"]');
      await expect(firstComponent).toBeVisible();

      const firstButton = firstComponent.locator(
        '[data-testid="counter-button"]',
      );
      await expect(firstButton).toBeVisible();

      // Test the first component's interaction functionality.
      await firstButton.click();
      await expect(firstButton).toHaveText(/Count: 1/);

      await firstButton.click();
      await expect(firstButton).toHaveText(/Count: 2/);
    });

    test('should trigger second component hydration when scrolled to bottom', async () => {
      // First scroll to the first component and wait for its hydration.
      await page.evaluate(() => {
        window.scrollTo(0, 900);
      });
      await page.waitForTimeout(2000);

      // Clear messages, focusing on the second component.
      consoleMessages = [];

      // Scroll to the bottom of the page to make the second component visible.
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for the second component hydration to complete.
      await page.waitForTimeout(2000);

      // Verify the second component's lazy-loading hydration messages.
      const hasSecondLazyHydrationMessage = consoleMessages.some((msg) =>
        msg.includes('Component HelloWorld lazy hydration completed'),
      );
      expect(hasSecondLazyHydrationMessage).toBe(true);

      // Verify the second component is visible and interactive.
      const secondComponent = page.locator('[data-testid="second-component"]');
      await expect(secondComponent).toBeVisible();

      const secondButton = secondComponent.locator(
        '[data-testid="counter-button"]',
      );
      await expect(secondButton).toBeVisible();

      // Test the second component's interaction functionality.
      await secondButton.click();
      await expect(secondButton).toHaveText(/Count: 1/);

      await secondButton.click();
      await expect(secondButton).toHaveText(/Count: 2/);
    });

    test('should handle complete page scroll with both components', async () => {
      let totalLazyHydrationMessages = 0;

      // Scroll to the middle to trigger the first component.
      await page.evaluate(() => {
        window.scrollTo(0, 900);
      });
      await page.waitForTimeout(2000);

      // Count the first component's hydration messages.
      const firstHydrationMessages = consoleMessages.filter((msg) =>
        msg.includes('Component HelloWorld lazy hydration completed'),
      );
      totalLazyHydrationMessages += firstHydrationMessages.length;

      // Scroll to the bottom to trigger the second component.
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(2000);

      // Count total hydration messages.
      const allHydrationMessages = consoleMessages.filter((msg) =>
        msg.includes('Component HelloWorld lazy hydration completed'),
      );
      totalLazyHydrationMessages = allHydrationMessages.length;

      // Should have hydration messages for two components.
      expect(totalLazyHydrationMessages).toBe(2);

      // Verify both components can interact normally.
      const firstComponent = page.locator('[data-testid="first-component"]');
      const secondComponent = page.locator('[data-testid="second-component"]');

      await expect(firstComponent).toBeVisible();
      await expect(secondComponent).toBeVisible();

      // Verify both buttons can be clicked.
      const firstButton = firstComponent.locator(
        '[data-testid="counter-button"]',
      );
      const secondButton = secondComponent.locator(
        '[data-testid="counter-button"]',
      );

      await firstButton.click();
      await expect(firstButton).toHaveText(/Count: 1/);

      await secondButton.click();
      await expect(secondButton).toHaveText(/Count: 1/);
    });
  });

  describe('Mixed Render Directives', () => {
    let consoleMessages: string[] = [];

    beforeEach(async () => {
      // Clear previous console messages.
      consoleMessages = [];

      // Listen for console messages.
      page.on('console', (msg) => {
        consoleMessages.push(msg.text());
      });

      await goto('/container-changes/mixed-directives');
    });

    afterEach(() => {
      // Clean up event listeners.
      page.removeAllListeners('console');
    });

    test('should validate all mixed directive console messages', async () => {
      // Wait for the page to fully load.
      await page.waitForTimeout(2000);

      // Verify basic initialization messages.
      const hasInitializationMessage = consoleMessages.some((msg) =>
        msg.includes('Initialization completed'),
      );
      expect(hasInitializationMessage).toBe(true);

      // Verify development runtime loading messages.
      const hasRuntimeMessage = consoleMessages.some((msg) =>
        msg.includes('Development render runtime loaded successfully'),
      );
      expect(hasRuntimeMessage).toBe(true);

      // Verify client:only client-side rendering messages.
      const hasClientRenderingMessage = consoleMessages.some((msg) =>
        msg.includes('Component HelloWorld client-side rendering completed'),
      );
      expect(hasClientRenderingMessage).toBe(true);

      // Verify client:load hydration messages.
      const hasHydrationMessage = consoleMessages.some((msg) =>
        msg.includes('Component HelloWorld hydration completed'),
      );
      expect(hasHydrationMessage).toBe(true);

      // Verify no lazy-loading hydration messages (client:visible is outside the viewport).
      const hasLazyHydrationMessage = consoleMessages.some((msg) =>
        msg.includes('Component HelloWorld lazy hydration completed'),
      );
      expect(hasLazyHydrationMessage).toBe(false);
    });

    test('should handle multiple containers with different directives', async () => {
      const containers = page.locator('[data-testid="hello-world"]');
      const count = await containers.count();

      // Should have multiple instances of same component (client:only, ssr:only, client:load)
      expect(count).toBeGreaterThan(2);

      // At least the first one should be visible
      await expect(containers.first()).toBeVisible();
    });

    test('should verify interactive behavior for each component type using uniqueId', async () => {
      // Wait for page loading to complete.
      await page.waitForTimeout(1000);

      // client:only component — should be interactive.
      const clientOnlyComponent = page.locator(
        '[data-unique-id="client-only"]',
      );
      const clientOnlyButton = clientOnlyComponent.locator(
        '[data-testid="counter-button"]',
      );

      await expect(clientOnlyComponent).toBeVisible();
      await expect(clientOnlyButton).toHaveText(/Count: 0/);

      await clientOnlyButton.click();
      await expect(clientOnlyButton).toHaveText(/Count: 1/);

      await clientOnlyButton.click();
      await expect(clientOnlyButton).toHaveText(/Count: 2/);

      // ssr:only component — should not be interactive.
      const ssrOnlyComponent = page.locator('[data-unique-id="ssr-only"]');
      const ssrOnlyButton = ssrOnlyComponent.locator(
        '[data-testid="counter-button"]',
      );

      await expect(ssrOnlyComponent).toBeVisible();
      await expect(ssrOnlyButton).toHaveText(/Count: 0/);

      await ssrOnlyButton.click();
      // Should remain 0, no change.
      await expect(ssrOnlyButton).toHaveText(/Count: 0/);

      await ssrOnlyButton.click();
      // Should still remain 0.
      await expect(ssrOnlyButton).toHaveText(/Count: 0/);

      // client:load component — should be interactive.
      const clientLoadComponent = page.locator(
        '[data-unique-id="client-load"]',
      );
      const clientLoadButton = clientLoadComponent.locator(
        '[data-testid="counter-button"]',
      );

      await expect(clientLoadComponent).toBeVisible();
      await expect(clientLoadButton).toHaveText(/Count: 0/);

      await clientLoadButton.click();
      await expect(clientLoadButton).toHaveText(/Count: 1/);

      await clientLoadButton.click();
      await expect(clientLoadButton).toHaveText(/Count: 2/);
    });

    test('should trigger client:visible component when scrolled into view', async () => {
      // First wait for initial component loading.
      await page.waitForTimeout(1000);

      // Clear messages, focusing on post-scroll lazy loading.
      consoleMessages = [];

      // Scroll to the bottom of the page to make the client:visible component visible.
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });

      // Wait for lazy-loading hydration to complete.
      await page.waitForTimeout(2000);

      // Verify lazy-loading hydration messages.
      const hasLazyHydrationMessage = consoleMessages.some((msg) =>
        msg.includes('Component HelloWorld lazy hydration completed'),
      );
      expect(hasLazyHydrationMessage).toBe(true);

      // Use uniqueId to verify the client:visible component is interactive.
      const clientVisibleComponent = page.locator(
        '[data-unique-id="client-visible"]',
      );
      const clientVisibleButton = clientVisibleComponent.locator(
        '[data-testid="counter-button"]',
      );

      await expect(clientVisibleComponent).toBeVisible();
      await expect(clientVisibleButton).toHaveText(/Count: 0/);

      await clientVisibleButton.click();
      await expect(clientVisibleButton).toHaveText(/Count: 1/);
    });
  });
});
