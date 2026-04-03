import { test, expect } from '@playwright/test';

test('Compact - when_X_changes_inc_Y_by', async ({ page }) => {
    await page.goto('./tests/compacts/compact-inc.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
