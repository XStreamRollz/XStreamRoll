import { test, expect } from '@playwright/test';

test.describe('Streams', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/auth/login');
    await page.fill('input[placeholder="Email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'Password123');
    await page.click('button:has-text("Login")');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('User can create a new stream', async ({ page }) => {
    await page.goto('/dashboard/streams/new');
    
    await page.fill('input[placeholder="My awesome stream"]', 'E2E Test Stream');
    await page.fill('textarea[placeholder="What is this stream about?"]', 'This is a stream created by E2E tests.');
    
    // Select visibility
    await page.click('button:has-text("Select visibility"), button:has-text("Public")');
    await page.click('div[role="option"]:has-text("Public"), text="Public"');

    await page.click('button:has-text("Create stream")');

    // Should redirect to stream detail page
    await expect(page).toHaveURL(/\/dashboard\/streams\/\d+/);
    await expect(page.locator('h1')).toContainText(/Stream \d+/);
    await expect(page.locator('text=Share this stream')).toBeVisible();
  });

  test('User can manage stream tags', async ({ page }) => {
    await page.goto('/dashboard/streams'); // This page currently has the tag editor for demo stream 1
    
    // Add a tag
    const tagInput = page.locator('input[placeholder="Add a tag..."]');
    await tagInput.fill('test-tag');
    await page.keyboard.press('Enter');

    // Verify tag is added
    await expect(page.locator('text=test-tag')).toBeVisible();

    // Remove the tag
    await page.click('button[aria-label="Remove test-tag"]');
    await expect(page.locator('text=test-tag')).not.toBeVisible();
  });
});
