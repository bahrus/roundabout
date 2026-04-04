import { test, expect } from '@playwright/test';

test('Hitch - Element change updates listener', async ({ page }) => {
    await page.goto('./tests/hitches/hitch-element-change.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
