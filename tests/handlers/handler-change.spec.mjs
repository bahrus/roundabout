import { test, expect } from '@playwright/test';
test('Handler - EventTarget change updates listener', async ({ page }) => {
    await page.goto('./tests/handlers/handler-change.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
