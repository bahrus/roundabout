import { test, expect } from '@playwright/test';

test('Performance - Cascade of interconnected actions', async ({ page }) => {
    await page.goto('./tests/performance/cascade-test.html');
    await page.waitForTimeout(5000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
