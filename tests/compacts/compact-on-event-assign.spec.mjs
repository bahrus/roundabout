import { test, expect } from '@playwright/test';

test('Compact - on_EVENT_of_X_assign', async ({ page }) => {
    await page.goto('./tests/compacts/compact-on-event-assign.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
