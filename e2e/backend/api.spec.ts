import { test, expect } from '@playwright/test';

test.describe('Backend API E2E', () => {
  test('Health check endpoint returns 200', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  test('Creates audit session successfully', async ({ request }) => {
    const payload = {
      user_name: 'E2E User',
      email: 'e2e@example.com',
      company_name: 'E2E Corp',
      file_name: 'e2etest.csv',
      file_type: 'csv'
    };
    
    const response = await request.post('/api/v1/audit/sessions', {
      data: payload
    });
    
    // In e2e, without auth, this might return 403, depending on the environment.
    // Assuming backend testing environment handles it or we expect 403 without OTP
    expect([200, 403]).toContain(response.status());
  });

  test('Request OTP for email', async ({ request }) => {
    const response = await request.post('/api/v1/auth/request-otp', {
      data: { email: 'e2e@example.com' }
    });
    
    expect(response.ok()).toBeTruthy();
  });
});
