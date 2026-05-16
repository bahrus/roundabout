import { test, expect } from '@playwright/test';

test('Yields - atIndex', async ({ page }) => {
    await page.goto('/tests/yields/yields-at-index.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
