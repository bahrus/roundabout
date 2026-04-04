import { test, expect } from '@playwright/test';

test('Action - ifAllOf', async ({ page }) => {
    await page.goto('./tests/actions/action-ifAllOf.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
