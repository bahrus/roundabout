import { test, expect } from '@playwright/test';
test('WeakRef list - Class instance with weakly-held element list', async ({ page }) => {
    await page.goto('./tests/weakref/class-instance-weakref-list.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
