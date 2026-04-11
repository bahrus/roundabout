import { test, expect } from '@playwright/test';
test('WeakRef - Class instance with proper storage scoping', async ({ page }) => {
    await page.goto('./tests/weakref/class-instance-weakref.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
