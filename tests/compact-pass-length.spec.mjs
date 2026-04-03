import { test, expect } from '@playwright/test';

test('Compact - pass_length_of_X_to_Y', async ({ page }) => {
    await page.goto('./tests/compact-pass-length.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
