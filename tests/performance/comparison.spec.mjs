import { test, expect } from '@playwright/test';

test('Performance - Comparison between traditional and internal routing', async ({ page }) => {
    await page.goto('./tests/performance/comparison.html');
    // Give it enough time to run both tests
    await page.waitForTimeout(5000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
