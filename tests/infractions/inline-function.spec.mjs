import { test, expect } from '@playwright/test';

test('Infraction - Inline function with destructured params', async ({ page }) => {
    await page.goto('./tests/infractions/inline-function.html');
    await page.waitForTimeout(1000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
