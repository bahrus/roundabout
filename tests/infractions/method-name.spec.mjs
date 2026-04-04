import { test, expect } from '@playwright/test';

test('Infraction - Method name reference', async ({ page }) => {
    await page.goto('./tests/infractions/method-name.html');
    await page.waitForTimeout(1000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
