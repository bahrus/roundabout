import { test, expect } from '@playwright/test';

test('Positraction - Basic Math.max with ifKeyIn', async ({ page }) => {
    await page.goto('./tests/positractions/basic-max.html');
    await page.waitForTimeout(1000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
