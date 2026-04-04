import { test, expect } from '@playwright/test';

test('Infraction - Multiple destructured parameters', async ({ page }) => {
    await page.goto('./tests/infractions/multiple-params.html');
    await page.waitForTimeout(1000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
