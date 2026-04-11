import { test, expect } from '@playwright/test';
test('WeakRef - Plain object with WeakRef property', async ({ page }) => {
    await page.goto('./tests/weakref/plain-object-weakref.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
