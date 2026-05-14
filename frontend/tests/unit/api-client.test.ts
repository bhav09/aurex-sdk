import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AurexAPI } from '../../lib/api-client';

describe('AurexAPI', () => {
    let api: AurexAPI;
    const mockBaseUrl = 'http://test-api.com/api/v1';

    beforeEach(() => {
        // Mock localStorage
        const localStorageMock = (function() {
            let store: Record<string, string> = {};
            return {
                getItem(key: string) {
                    return store[key] || null;
                },
                setItem(key: string, value: string) {
                    store[key] = value.toString();
                },
                clear() {
                    store = {};
                }
            };
        })();
        Object.defineProperty(window, 'localStorage', {
            value: localStorageMock,
            writable: true
        });
        window.localStorage.clear();

        api = new AurexAPI(mockBaseUrl);
        // Mock global fetch
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Token Management & Authorization', () => {
        it('should persist token in localStorage when setToken is called', () => {
            api.setToken('mock_jwt_token');
            expect(window.localStorage.getItem('aurex_token')).toBe('mock_jwt_token');
            // Also check that a new instance picks it up
            const newApi = new AurexAPI(mockBaseUrl);
            // It should be injected
            expect((newApi as any).token).toBe('mock_jwt_token');
        });

        it('should not include Authorization header if token is absent', async () => {
            const mockResponse = {
                executive_summary: { current_weekly_spend: 100 },
                total_events: 50,
            };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            await api.getExecutiveSummary();

            // The headers object should either be empty or not contain Authorization
            expect(global.fetch).toHaveBeenCalledWith(
                `${mockBaseUrl}/executive-summary`,
                expect.objectContaining({
                    headers: expect.not.objectContaining({
                        Authorization: expect.anything()
                    })
                })
            );
        });

        it('should inject Authorization header when token is present', async () => {
            api.setToken('mock_jwt_token');

            const mockResponse = {
                executive_summary: { current_weekly_spend: 100 },
                total_events: 50,
            };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            await api.getExecutiveSummary();

            expect(global.fetch).toHaveBeenCalledWith(
                `${mockBaseUrl}/executive-summary`,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer mock_jwt_token'
                    })
                })
            );
        });
    });

    describe('getExecutiveSummary', () => {
        it('should fetch executive summary without email', async () => {
            const mockResponse = {
                executive_summary: { current_weekly_spend: 100 },
                total_events: 50,
            };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await api.getExecutiveSummary();

            expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/executive-summary`, expect.anything());
            expect(result).toEqual(mockResponse);
        });

        it('should fetch executive summary with email', async () => {
            const mockResponse = {
                executive_summary: { current_weekly_spend: 200 },
                total_events: 150,
            };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await api.getExecutiveSummary('test@example.com');

            expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/executive-summary?email=test%40example.com`, expect.anything());
            expect(result).toEqual(mockResponse);
        });

        it('should throw error when fetch fails', async () => {
            (global.fetch as any).mockResolvedValueOnce({
                ok: false,
            });

            await expect(api.getExecutiveSummary()).rejects.toThrow('Failed to fetch executive summary');
        });
    });

    describe('uploadCSV', () => {
        it('should upload CSV successfully', async () => {
            const mockFile = new File(['content'], 'test.csv', { type: 'text/csv' });
            const mockResponse = { status: 'success', events_ingested: 10, upload_session_id: '123' };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await api.uploadCSV(mockFile, 'session-123');

            expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/upload/csv?session_id=session-123`, expect.objectContaining({
                method: 'POST',
                body: expect.any(FormData),
            }));
            expect(result).toEqual(mockResponse);
        });
    });

    describe('createAuditSession', () => {
        it('should create audit session', async () => {
            const mockData = {
                user_name: 'John Doe',
                email: 'john@example.com',
                company_name: 'Acme',
                file_name: 'test.csv',
                file_type: 'csv'
            };
            const mockResponse = { id: 'session-123', ...mockData };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await api.createAuditSession(mockData);

            expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/audit/sessions`, expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json'
                }),
                body: JSON.stringify(mockData)
            }));
            expect(result).toEqual(mockResponse);
        });
    });
});
