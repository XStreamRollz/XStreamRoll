import { test, expect } from '@playwright/test';

test.describe('Admin Dashboard', () => {
  test('Access is restricted for non-admin users', async ({ page }) => {
    // Login as a regular user
    await page.goto('/auth/login');
    await page.fill('input[placeholder="Email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Password123');
    await page.click('button:has-text("Login")');
    await expect(page).toHaveURL(/\/dashboard/);

    // Try to access admin dashboard
    await page.goto('/admin');
    
    // Should show 404 (Next.js default notFound page)
    await expect(page.locator('h1, h2, text=404')).toBeVisible();
    await expect(page.locator('text=Admin Dashboard')).not.toBeVisible();
  });

  test('Access is allowed for admin users', async ({ page }) => {
    // This test assumes an admin user exists or we can mock it
    // For now, it might fail if we don't have an admin user in the test DB
    await page.goto('/auth/login');
    await page.fill('input[placeholder="Email"]', 'admin@xstreamroll.io');
    await page.fill('input[type="password"]', 'AdminPassword123');
    await page.click('button:has-text("Login")');
    
    await page.goto('/admin');
    await expect(page.locator('h1')).toContainText('Admin Dashboard');
  });
});
