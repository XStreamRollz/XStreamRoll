import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  const email = `test-${Date.now()}@example.com`;
  const password = 'Password123';
  const username = `user_${Date.now()}`;

  test('User can register', async ({ page }) => {
    await page.goto('/auth/register');
    
    // Fill registration form
    // Note: Based on current register/page.tsx, it might only have email/password
    // but the API requires username. If the UI is broken, this test will fail
    // which is the point of E2E tests.
    await page.fill('input[placeholder="Email"]', email);
    await page.fill('input[type="password"]', password);
    
    // If username is present, fill it
    const usernameInput = page.locator('input[placeholder="Username"]');
    if (await usernameInput.isVisible()) {
      await usernameInput.fill(username);
    }

    await page.click('button:has-text("Register"), button:has-text("Login")'); // UI says Login currently

    // After successful registration, it should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('User can login', async ({ page }) => {
    // Assuming registration happened or we use existing user
    await page.goto('/auth/login');
    
    await page.fill('input[placeholder="Email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Password123');
    
    await page.click('button:has-text("Login")');

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('Logout works', async ({ page }) => {
    // Login first
    await page.goto('/auth/login');
    await page.fill('input[placeholder="Email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Password123');
    await page.click('button:has-text("Login")');
    await expect(page).toHaveURL(/\/dashboard/);

    // Click logout
    await page.click('button:has-text("Logout")');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
