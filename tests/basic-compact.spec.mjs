import { test, expect } from '@playwright/test';

test('Basic compact - when_age_changes_call_throwBirthdayParty', async ({ page }) => {
    await page.goto('./tests/basic-compact.html');
    await page.waitForTimeout(2000);
    const target = page.locator('#target');
    await expect(target).toHaveAttribute('mark', 'good');
});
