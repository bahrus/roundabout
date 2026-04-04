import { test, expect } from '@playwright/test';

test('Action - ifKeyIn', async ({ page }) => {
    await page.goto('./tests/actions/action-ifKeyIn.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
