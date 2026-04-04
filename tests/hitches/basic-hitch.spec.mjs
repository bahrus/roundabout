import { test, expect } from '@playwright/test';

test('Hitch - when_X_emits_Y_inc_Z_by', async ({ page }) => {
    await page.goto('./tests/hitches/basic-hitch.html');
    await page.waitForTimeout(1000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
