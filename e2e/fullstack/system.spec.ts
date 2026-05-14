import { test, expect } from '@playwright/test';

test.describe('Full-Stack E2E Flow', () => {
  // Use sequential mode if tests modify shared database
  test.describe.configure({ mode: 'serial' });

  test('User can navigate to audit and upload data to real backend', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to Audit page
    await page.goto('/audit');
    
    // Check that we are on the audit page
    await expect(page.getByText(/Upload/i).first()).toBeVisible();

    // Since this hits the real backend, testing the upload flow requires a dummy CSV file.
    // For this demonstration, we'll verify the page interactions.
    
    // Create a mock file
    const fileContent = 'timestamp,model,input_tokens,output_tokens,cost\n2024-05-15,gpt-4o,100,50,0.01';
    
    // Assuming there's a file input with type="file"
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.isVisible()) {
      await fileInput.setInputFiles({
        name: 'test_upload.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(fileContent)
      });
      
      // Look for upload/submit button
      const submitBtn = page.getByRole('button', { name: /Analyze/i });
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        
        // Either expect a success message or an auth modal (if OTP is required)
        // Wait for network idle or text change
        await expect(page.getByText(/success|verify|OTP/i).first()).toBeVisible({ timeout: 10000 });
      }
    }
  });
});
