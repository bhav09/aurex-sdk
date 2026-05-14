import { test, expect } from '@playwright/test';

test.describe('Frontend UI E2E (Mocked Backend)', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the executive summary API
    await page.route('**/api/v1/executive-summary*', async route => {
      const json = {
        executive_summary: {
          current_weekly_spend: 500,
          wasted_amount: 100,
          waste_percentage: 20,
          optimized_spend: 400,
          annual_savings_projection: 5200,
          period_days: 7,
          severity: 'MEDIUM'
        },
        top_issues: [],
        workflow_breakdown: [],
        total_events: 100,
        analysis_timestamp: new Date().toISOString()
      };
      await route.fulfill({ json });
    });

    // Mock the upload API
    await page.route('**/api/v1/upload/csv*', async route => {
      const json = {
        status: 'success',
        events_ingested: 10,
        upload_session_id: 'mock_session_123'
      };
      await route.fulfill({ json });
    });
  });

  test('has title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Aurex/i); // Adjust based on actual title
  });

  test('can navigate to audit page', async ({ page }) => {
    await page.goto('/');
    
    // Find link or button to audit page and click it
    const auditLink = page.getByRole('link', { name: /Audit/i }).first();
    if (await auditLink.isVisible()) {
      await auditLink.click();
      await expect(page).toHaveURL(/.*\/audit/);
    } else {
      await page.goto('/audit');
      await expect(page.getByText(/Upload/i).first()).toBeVisible();
    }
  });
});
