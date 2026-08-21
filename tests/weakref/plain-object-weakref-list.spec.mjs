import { test, expect } from '@playwright/test';
test('WeakRef list - Plain object with weakly-held element list', async ({ page }) => {
    await page.goto('./tests/weakref/plain-object-weakref-list.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
