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

        // Mock sessionStorage
        const sessionStorageMock = (function() {
            let store: Record<string, string> = {};
            return {
                getItem(key: string) {
                    return store[key] || null;
                },
                setItem(key: string, value: string) {
                    store[key] = value.toString();
                },
                removeItem(key: string) {
                    delete store[key];
                },
                clear() {
                    store = {};
                }
            };
        })();
        Object.defineProperty(window, 'sessionStorage', {
            value: sessionStorageMock,
            writable: true
        });

        api = new AurexAPI(mockBaseUrl);
        // Mock global fetch
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Token Management & Authorization', () => {
        it('should persist token in memory when setToken is called', () => {
            api.setToken('mock_jwt_token');
            expect((api as any).token).toBe('mock_jwt_token');
        });

        it('should persist token in sessionStorage when setToken is called', () => {
            api.setToken('mock_jwt_token_session');
            expect(window.sessionStorage.getItem('aurex_token')).toBe('mock_jwt_token_session');
            expect(api.hasActiveSession()).toBe(true);
        });

        it('should restore token from sessionStorage in constructor', () => {
            window.sessionStorage.setItem('aurex_token', 'restored_token');
            const newApi = new AurexAPI(mockBaseUrl);
            expect(newApi.hasActiveSession()).toBe(true);
            expect((newApi as any).token).toBe('restored_token');
        });

        it('should save and restore user info in sessionStorage', () => {
            const userInfo = {
                user_name: 'Jane Doe',
                email: 'jane@example.com',
                company_name: 'Aurex Corp'
            };
            api.setUserInfo(userInfo);
            expect(JSON.parse(window.sessionStorage.getItem('aurex_user_info')!)).toEqual(userInfo);
            expect(api.getUserInfo()).toEqual(userInfo);
            
            api.clearSession();
            expect(api.hasActiveSession()).toBe(false);
            expect(api.getUserInfo()).toBeNull();
        });

        it('should not include Authorization header if token is absent', async () => {
            const mockResponse = {
                executive_summary: { current_period_spend: 100 },
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
                executive_summary: { current_period_spend: 100 },
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
                executive_summary: { current_period_spend: 100 },
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
                executive_summary: { current_period_spend: 200 },
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

    describe('loginWithSSO', () => {
        it('should call sso-login endpoint and persist token + user info', async () => {
            const mockResponse = {
                status: 'success',
                access_token: 'sso_token_123',
                token_type: 'bearer',
                user_info: {
                    user_name: 'SSO User',
                    email: 'sso@example.com',
                    company_name: 'SSO Company'
                }
            };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await api.loginWithSSO('sso@example.com', 'SSO User', 'SSO Company', 'google');

            expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/auth/sso-login`, expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    email: 'sso@example.com',
                    user_name: 'SSO User',
                    company_name: 'SSO Company',
                    provider: 'google'
                })
            }));
            expect(result).toEqual(mockResponse);
            expect(api.hasActiveSession()).toBe(true);
            expect(api.getUserInfo()).toEqual(mockResponse.user_info);
        });
    });

    describe('pricingOverrides', () => {
        it('should fetch pricing overrides', async () => {
            const mockResponse = [
                { id: '1', company_name: 'Acme', model_name: 'gpt-4o', input_price_per_1m: 1.0, output_price_per_1m: 4.0 }
            ];

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await api.getPricingOverrides('Acme');

            expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/pricing/overrides?company_name=Acme`, expect.objectContaining({
                method: 'GET'
            }));
            expect(result).toEqual(mockResponse);
        });

        it('should upload pricing overrides file', async () => {
            const mockFile = new File(['{"overrides":[]}'], 'overrides.json', { type: 'application/json' });
            const mockResponse = { status: 'success', overrides_added: 0 };

            (global.fetch as any).mockResolvedValueOnce({
                ok: true,
                json: async () => mockResponse,
            });

            const result = await api.uploadPricingOverrides(mockFile, 'Acme');

            expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/pricing/overrides?company_name=Acme`, expect.objectContaining({
                method: 'POST',
                body: expect.any(FormData)
            }));
            expect(result).toEqual(mockResponse);
        });
    });

    describe('getProjectStats', () => {
        it('calls /stats without query param when no projectId given', async () => {
            const mockStats = {
                total_events: 0, total_cost: 0, spend_7d: 0, spend_24h: 0,
                total_tokens: 0, unique_workflows: 0, unique_models: 0,
                top_models: [], date_range: { first_event: null, last_event: null }
            };
            (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => mockStats });

            const result = await api.getProjectStats();

            expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/stats`, expect.anything());
            expect(result).toEqual(mockStats);
        });

        it('calls /stats?project_id=... when projectId given', async () => {
            const mockStats = {
                total_events: 5, total_cost: 0.42, spend_7d: 0.30, spend_24h: 0.10,
                total_tokens: 750, unique_workflows: 2, unique_models: 1,
                top_models: [{ model: 'gpt-4o', cost: 0.42, calls: 5 }],
                date_range: { first_event: '2026-05-01T00:00:00', last_event: '2026-05-28T00:00:00' }
            };
            (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => mockStats });

            const result = await api.getProjectStats('proj-abc123');

            expect(global.fetch).toHaveBeenCalledWith(
                `${mockBaseUrl}/stats?project_id=proj-abc123`,
                expect.anything()
            );
            expect(result.total_events).toBe(5);
            expect(result.top_models[0].model).toBe('gpt-4o');
        });

        it('throws on non-ok response', async () => {
            (global.fetch as any).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
            await expect(api.getProjectStats('proj-x')).rejects.toThrow('Failed to fetch stats');
        });
    });

    describe('getProjectWorkflows', () => {
        it('calls /workflows without query param when no projectId given', async () => {
            (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => [] });

            await api.getProjectWorkflows();

            expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/workflows`, expect.anything());
        });

        it('calls /workflows?project_id=... when projectId given', async () => {
            const mockWf = [
                { workflow_id: 'wf-alpha', event_count: 3, total_cost: 0.15, total_tokens: 450, start_time: null, end_time: null }
            ];
            (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => mockWf });

            const result = await api.getProjectWorkflows('proj-xyz');

            expect(global.fetch).toHaveBeenCalledWith(
                `${mockBaseUrl}/workflows?project_id=proj-xyz`,
                expect.anything()
            );
            expect(result).toHaveLength(1);
            expect(result[0].workflow_id).toBe('wf-alpha');
        });

        it('throws on non-ok response', async () => {
            (global.fetch as any).mockResolvedValueOnce({ ok: false, json: async () => ({}) });
            await expect(api.getProjectWorkflows('proj-x')).rejects.toThrow('Failed to fetch workflows');
        });
    });

    describe('getEvents with project_id', () => {
        it('includes project_id in query string when provided', async () => {
            (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => [] });

            await api.getEvents({ project_id: 'proj-123', limit: 50 });

            const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
            expect(calledUrl).toContain('project_id=proj-123');
            expect(calledUrl).toContain('limit=50');
        });

        it('omits project_id when not provided', async () => {
            (global.fetch as any).mockResolvedValueOnce({ ok: true, json: async () => [] });

            await api.getEvents({ limit: 10 });

            const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
            expect(calledUrl).not.toContain('project_id');
        });
    });
});

