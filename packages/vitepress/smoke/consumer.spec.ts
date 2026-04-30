import { expect, test } from './consumer.fixtures';
import {
  CONSUMER_SMOKE_ROUTE,
  formatUnknownError,
  renderConsumerFailureDetails,
  watchPageRuntime,
} from './helpers';

test('consumer fixture renders and hydrates a React island', async ({
  consumerServer,
  page,
}, testInfo) => {
  const runtime = watchPageRuntime(page);

  try {
    await page.goto(`http://127.0.0.1:${consumerServer.port}/`, {
      waitUntil: 'domcontentloaded',
    });

    const smokeLink = page.getByRole('link', {
      name: 'Open consumer smoke page',
    });
    await expect(smokeLink).toBeVisible({
      timeout: 15_000,
    });
    await Promise.all([
      page.waitForURL((url) => {
        return (
          url.pathname === CONSUMER_SMOKE_ROUTE ||
          url.pathname === `${CONSUMER_SMOKE_ROUTE}.html`
        );
      }),
      smokeLink.click(),
    ]);

    const button = page.locator('[data-testid="counter-button"]');
    const component = page.locator('[data-testid="hello-world"]');

    await expect(component).toBeVisible({
      timeout: 15_000,
    });
    await expect(button).toBeVisible({
      timeout: 15_000,
    });
    await button.click();
    await expect(button).toContainText('Count: 1');
    runtime.assertClean();
  } catch (error) {
    const details = await renderConsumerFailureDetails(page, runtime);

    await testInfo.attach('consumer-debug-details', {
      body: details,
      contentType: 'text/plain',
    });
    throw new Error(`${formatUnknownError(error)}\n\n${details}`.trim());
  } finally {
    runtime.detach();
  }
});
