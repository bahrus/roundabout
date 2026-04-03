import { test, expect } from '@playwright/test';

test('Compact - negate_X_to_Y', async ({ page }) => {
    await page.goto('./tests/compact-negate.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
