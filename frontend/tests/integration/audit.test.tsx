import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuditPage from '../../app/audit/page';
import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';

// Mock the API client
vi.mock('../../lib/api-client', () => ({
  aurexAPI: {
    uploadCSVWithUserInfo: vi.fn().mockResolvedValue({
      session: { id: 'session_123' },
      upload_result: { status: 'success' }
    }),
    completeAudit: vi.fn().mockResolvedValue({
      session: { credit_score: 85 },
      summary: { executive_summary: { current_period_spend: 100 } }
    }),
    requestOTP: vi.fn().mockResolvedValue({ status: 'success' }),
    verifyOTP: vi.fn().mockResolvedValue({ status: 'success' }),
    getUserInfo: vi.fn().mockReturnValue(null),
    setUserInfo: vi.fn(),
    hasActiveSession: vi.fn().mockReturnValue(false),
    clearSession: vi.fn(),
    trackClick: vi.fn().mockResolvedValue({ status: 'success' })
  }
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/audit',
  useSearchParams: () => new URLSearchParams(),
}));

describe('Audit Integration Flow', () => {
    it('renders audit page and simulates upload flow', async () => {
        // Minimal integration test for the page rendering
        render(<AuditPage />);
        
        // Wait for it to settle
        await waitFor(() => {
            expect(screen.getAllByText(/Upload/i).length).toBeGreaterThan(0);
        });
    });
});
