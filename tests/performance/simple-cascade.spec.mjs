import { test, expect } from '@playwright/test';

test('Performance - Simple cascade test', async ({ page }) => {
    await page.goto('./tests/performance/simple-cascade.html');
    await page.waitForTimeout(1000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
