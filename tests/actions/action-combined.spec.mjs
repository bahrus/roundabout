import { test, expect } from '@playwright/test';

test('Action - Combined conditions (ifAllOf + ifKeyIn)', async ({ page }) => {
    await page.goto('./tests/actions/action-combined.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
