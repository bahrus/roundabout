import { test, expect } from '@playwright/test';
test('Handler - WeakRef EventTarget to method', async ({ page }) => {
    await page.goto('./tests/handlers/weakref-handler.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
