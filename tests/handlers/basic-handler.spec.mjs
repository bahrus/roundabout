import { test, expect } from '@playwright/test';
test('Handler - Basic EventTarget to method', async ({ page }) => {
    await page.goto('./tests/handlers/basic-handler.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
