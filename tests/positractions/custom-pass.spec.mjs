import { test, expect } from '@playwright/test';

test('Positraction - Custom pass parameters with literals', async ({ page }) => {
    await page.goto('./tests/positractions/custom-pass.html');
    await page.waitForTimeout(1000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
