import { test, expect } from '@playwright/test';

test.describe('Error Pages', () => {
  test('Should show 404 for non-existent routes', async ({ page }) => {
    await page.goto('/some-random-route-that-does-not-exist');
    
    // Check for 404 text or status
    await expect(page.locator('h1, h2, text=404')).toBeVisible();
  });

  test('Should show error for unauthorized access to dashboard (if not logged in)', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Based on middleware, it should redirect to login or show 401/403
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
