import { test, expect } from '@playwright/test';

test('Compact - when_X_changes_toggle_Y', async ({ page }) => {
    await page.goto('./tests/compacts/compact-toggle.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
