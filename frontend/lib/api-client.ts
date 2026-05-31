// API Client for Aurex Backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://aurex-backend-858789082997.us-central1.run.app/api/v1';

export interface ExecutiveSummary {
    executive_summary: {
        current_period_spend: number;
        wasted_amount: number;
        waste_percentage: number;
        optimized_spend: number;
        annual_savings_projection: number;
        period_days: number;
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        cost_per_outcome_current?: number;
        cost_per_outcome_optimized?: number;
    };
    top_issues: Issue[];
    workflow_breakdown: WorkflowBreakdown[];
    total_events: number;
    analysis_timestamp: string;
}

export interface Issue {
    rank: number;
    issue_type: string;
    title: string;
    severity: string;
    weekly_cost: number;
    one_line_summary: string;
    fix_effort: string;
    fix_confidence: string;
    cta: string;
    affected_workflow: string;
    affected_event_count: number;
    affected_events_sample: string[];
    metadata: Record<string, any>;
}

export interface WorkflowBreakdown {
    workflow_id: string;
    request_count: number;
    total_cost: number;
    cost_per_request: number;
    total_tokens: number;
    models_used: string[];
    first_request: string;
    last_request: string;
}

export interface LLMEvent {
    id: string;
    timestamp: string;
    provider: string;
    model: string;
    workflow_id: string;
    step_id: string | null;
    parent_step_id: string | null;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    cost: number;
    prompt: string | null;
    response: string | null;
    system_prompt_hash: string | null;
    context_length: number;
    outcome: string | null;
    extra_metadata: Record<string, any>;
}

export interface AuditSession {
    id: string;
    user_name: string;
    email: string;
    company_name: string;
    credit_score: number | null;
    total_cost: number | null;
    wasted_cost: number | null;
    waste_percentage: number | null;
    file_name: string | null;
    file_type: string | null;
    total_events: number | null;
    total_workflows: number | null;
    issues_found: number | null;
    created_at: string;
    updated_at: string;
}

export interface ApiKeyMetadata {
    id: string;
    prefix: string;
    last4: string | null;
    name: string;
    is_active: boolean;
    created_at: string;
    last_used_at: string | null;
    project_id: string | null;
    environment: string | null;
    scopes: string[] | null;
    revoked_at: string | null;
}

export interface ApiKeyGenerated {
    id: string;
    key: string;
    prefix: string;
    name: string;
    is_active: boolean;
    created_at: string;
    project_id: string | null;
    environment: string | null;
    scopes: string[] | null;
}

export interface CreateAuditSessionRequest {
    user_name: string;
    email: string;
    company_name: string;
    file_name: string;
    file_type: string;
}

export class AurexAPI {
    private baseUrl: string;
    private token: string | null = null;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
        this.loadSession();
    }

    private loadSession() {
        if (typeof window !== 'undefined') {
            try {
                this.token = sessionStorage.getItem('aurex_token');
            } catch (e) {
                console.warn('Failed to read sessionStorage', e);
            }
        }
    }

    setToken(token: string) {
        this.token = token;
        if (typeof window !== 'undefined') {
            try {
                if (token) {
                    sessionStorage.setItem('aurex_token', token);
                } else {
                    sessionStorage.removeItem('aurex_token');
                }
            } catch (e) {
                console.warn('Failed to write sessionStorage', e);
            }
        }
    }

    setUserInfo(userInfo: { user_name: string; email: string; company_name: string } | null) {
        if (typeof window !== 'undefined') {
            try {
                if (userInfo) {
                    sessionStorage.setItem('aurex_user_info', JSON.stringify(userInfo));
                } else {
                    sessionStorage.removeItem('aurex_user_info');
                }
            } catch (e) {
                console.warn('Failed to write sessionStorage', e);
            }
        }
    }

    getUserInfo(): { user_name: string; email: string; company_name: string } | null {
        if (typeof window !== 'undefined') {
            try {
                const info = sessionStorage.getItem('aurex_user_info');
                return info ? JSON.parse(info) : null;
            } catch (e) {
                console.warn('Failed to read sessionStorage', e);
            }
        }
        return null;
    }

    getToken(): string | null {
        return this.token;
    }

    hasActiveSession(): boolean {
        return !!this.token;
    }

    clearSession() {
        this.setToken('');
        this.setUserInfo(null);
        if (typeof window !== 'undefined') {
            try {
                sessionStorage.removeItem('aurex_org_id');
                sessionStorage.removeItem('aurex_project_id');
            } catch (e) {
                console.warn('Failed to clear session storage tenancy items', e);
            }
        }
    }

    getOrgId(): string | null {
        if (typeof window !== 'undefined') {
            try {
                return sessionStorage.getItem('aurex_org_id');
            } catch (e) {
                console.warn('Failed to read sessionStorage org_id', e);
            }
        }
        return null;
    }

    getProjectId(): string | null {
        if (typeof window !== 'undefined') {
            try {
                return sessionStorage.getItem('aurex_project_id');
            } catch (e) {
                console.warn('Failed to read sessionStorage project_id', e);
            }
        }
        return null;
    }

    setOrgId(orgId: string) {
        if (typeof window !== 'undefined') {
            try {
                if (orgId) {
                    sessionStorage.setItem('aurex_org_id', orgId);
                } else {
                    sessionStorage.removeItem('aurex_org_id');
                }
            } catch (e) {
                console.warn('Failed to write sessionStorage org_id', e);
            }
        }
    }

    setProjectId(projectId: string) {
        if (typeof window !== 'undefined') {
            try {
                if (projectId) {
                    sessionStorage.setItem('aurex_project_id', projectId);
                } else {
                    sessionStorage.removeItem('aurex_project_id');
                }
            } catch (e) {
                console.warn('Failed to write sessionStorage project_id', e);
            }
        }
    }

    private getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
        const headers: Record<string, string> = { ...customHeaders };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    private async fetchWithRetry(url: string, options: RequestInit = {}, maxRetries = 3): Promise<Response> {
        let retries = 0;
        let baseDelay = 500;
        
        while (true) {
            try {
                const response = await fetch(url, options);
                if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) {
                    return response;
                }
                
                if (retries >= maxRetries) {
                    return response;
                }
            } catch (error) {
                if (retries >= maxRetries) {
                    throw error;
                }
            }
            
            const delay = baseDelay * Math.pow(2, retries) + Math.random() * 200;
            await new Promise(resolve => setTimeout(resolve, delay));
            retries++;
        }
    }

    // Upload CSV
    async uploadCSV(file: File, sessionId?: string): Promise<{
        status: string;
        events_ingested: number;
        upload_session_id: string;
    }> {
        const formData = new FormData();
        formData.append('file', file);

        let url = `${this.baseUrl}/upload/csv`;
        if (sessionId) {
            url += `?session_id=${encodeURIComponent(sessionId)}`;
        }

        const response = await this.fetchWithRetry(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Upload failed');
        }

        return response.json();
    }

    // Track CTA button click
    async trackClick(buttonId: string, email?: string, sessionId?: string): Promise<{ status: string }> {
        try {
            const response = await this.fetchWithRetry(`${this.baseUrl}/analytics/click`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    button_id: buttonId,
                    email,
                    session_id: sessionId
                }),
            });
            if (!response.ok) {
                return { status: 'failed' };
            }
            return response.json();
        } catch (e) {
            console.warn('Failed to track click analytics', e);
            return { status: 'failed' };
        }
    }

    // Get executive summary
    async getExecutiveSummary(email?: string): Promise<ExecutiveSummary> {
        const url = email 
            ? `${this.baseUrl}/executive-summary?email=${encodeURIComponent(email)}`
            : `${this.baseUrl}/executive-summary`;
            
        const response = await this.fetchWithRetry(url, { headers: this.getHeaders() });

        if (!response.ok) {
            throw new Error('Failed to fetch executive summary');
        }

        return response.json();
    }

    // Get savings realization analytics
    async getSavingsRealization(companyName: string): Promise<{
        total_realized_savings: number;
        annualized_savings_run_rate: number;
        timeline: Array<{ date: string; realized_savings: number; total_waste: number }>;
        category_breakdown: Record<string, number>;
    }> {
        const url = `${this.baseUrl}/analytics/savings-realization?company_name=${encodeURIComponent(companyName)}`;
        const response = await this.fetchWithRetry(url, { headers: this.getHeaders() });
        if (!response.ok) {
            throw new Error('Failed to fetch savings realization');
        }
        return response.json();
    }

    // List API keys
    async listApiKeys(): Promise<Array<{
        id: string;
        prefix: string;
        name: string;
        company_name: string;
        is_active: boolean;
        created_at: string;
        last_used_at: string | null;
    }>> {
        const url = `${this.baseUrl}/auth/api-keys`;
        const response = await this.fetchWithRetry(url, { headers: this.getHeaders() });
        if (!response.ok) {
            throw new Error('Failed to fetch API keys');
        }
        return response.json();
    }

    // Generate API key
    async generateApiKey(name: string, companyName: string): Promise<{
        id: string;
        key: string;
        prefix: string;
        name: string;
        company_name: string;
        is_active: boolean;
        created_at: string;
    }> {
        const url = `${this.baseUrl}/auth/api-keys`;
        const response = await this.fetchWithRetry(url, {
            method: 'POST',
            headers: {
                ...this.getHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, company_name: companyName })
        });
        if (!response.ok) {
            throw new Error('Failed to generate API key');
        }
        return response.json();
    }

    // Revoke API key (legacy /auth/api-keys path)
    async revokeApiKey(keyId: string): Promise<{ status: string; message: string }> {
        const url = `${this.baseUrl}/auth/api-keys/${keyId}`;
        const response = await this.fetchWithRetry(url, {
            method: 'DELETE',
            headers: this.getHeaders()
        });
        if (!response.ok) {
            throw new Error('Failed to revoke API key');
        }
        return response.json();
    }

    // ============================================================================
    // PROJECT-SCOPED API KEYS (v1)
    // ============================================================================

    async listProjects(): Promise<Array<{ id: string; org_id: string; name: string; environment: string }>> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/projects`, { headers: this.getHeaders() });
        if (!response.ok) throw new Error('Failed to fetch projects');
        return response.json();
    }

    async createProject(name: string, environment: string): Promise<{ id: string; org_id: string; name: string; environment: string }> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/projects`, {
            method: 'POST',
            headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, environment }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to create project');
        }
        return response.json();
    }

    async updateProject(projectId: string, data: { name?: string; environment?: string; slack_webhook_url?: string }): Promise<{ id: string; org_id: string; name: string; environment: string; slack_webhook_url?: string }> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/projects/${projectId}`, {
            method: 'PATCH',
            headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to update project');
        }
        return response.json();
    }

    async updateOrganization(orgId: string, name: string): Promise<{ status: string; id: string; name: string }> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/organizations/${orgId}`, {
            method: 'PATCH',
            headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to update organization');
        }
        return response.json();
    }

    async listKeysV1(projectId?: string): Promise<Array<ApiKeyMetadata>> {
        const url = projectId
            ? `${this.baseUrl}/keys?project_id=${encodeURIComponent(projectId)}`
            : `${this.baseUrl}/keys`;
        const response = await this.fetchWithRetry(url, { headers: this.getHeaders() });
        if (!response.ok) throw new Error('Failed to fetch API keys');
        return response.json();
    }

    async createKeyV1(body: {
        name: string;
        project_id: string;
        environment: 'dev' | 'staging' | 'prod';
        scopes?: string[];
    }): Promise<ApiKeyGenerated> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/keys`, {
            method: 'POST',
            headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to create API key');
        }
        return response.json();
    }

    async revokeKeyV1(keyId: string): Promise<void> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/keys/${keyId}`, {
            method: 'DELETE',
            headers: this.getHeaders(),
        });
        if (!response.ok) throw new Error('Failed to revoke API key');
    }

    async rotateKeyV1(keyId: string): Promise<ApiKeyGenerated> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/keys/${keyId}/rotate`, {
            method: 'POST',
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || 'Failed to rotate API key');
        }
        return response.json();
    }

    // Download executive PDF report
    async downloadExecutiveReport(sessionId: string): Promise<Blob> {
        const url = `${this.baseUrl}/audit/sessions/${sessionId}/report`;
        const response = await this.fetchWithRetry(url, { headers: this.getHeaders() });
        if (!response.ok) {
            throw new Error('Failed to download executive report PDF');
        }
        return response.blob();
    }

    // Get individual events with optional filtering
    async getEvents(params?: {
        skip?: number;
        limit?: number;
        workflow_id?: string;
        provider?: string;
        model?: string;
        project_id?: string;
        session_id?: string;
    }): Promise<LLMEvent[]> {
        const queryParams = new URLSearchParams();
        if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
        if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
        if (params?.workflow_id) queryParams.append('workflow_id', params.workflow_id);
        if (params?.provider) queryParams.append('provider', params.provider);
        if (params?.model) queryParams.append('model', params.model);
        if (params?.project_id) queryParams.append('project_id', params.project_id);
        if (params?.session_id) queryParams.append('session_id', params.session_id);

        const url = `${this.baseUrl}/events${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await this.fetchWithRetry(url, { headers: this.getHeaders() });

        if (!response.ok) {
            throw new Error('Failed to fetch events');
        }

        return response.json();
    }

    async getProjectStats(projectId?: string): Promise<{
        total_events: number;
        total_cost: number;
        spend_7d: number;
        spend_24h: number;
        total_tokens: number;
        unique_workflows: number;
        unique_models: number;
        top_models: Array<{ model: string; cost: number; calls: number }>;
        date_range: { first_event: string | null; last_event: string | null };
    }> {
        const url = projectId
            ? `${this.baseUrl}/stats?project_id=${encodeURIComponent(projectId)}`
            : `${this.baseUrl}/stats`;
        const response = await this.fetchWithRetry(url, { headers: this.getHeaders() });
        if (!response.ok) throw new Error('Failed to fetch stats');
        return response.json();
    }

    async getProjectWorkflows(projectId?: string): Promise<Array<{
        workflow_id: string;
        event_count: number;
        total_cost: number;
        total_tokens: number;
        start_time: string | null;
        end_time: string | null;
    }>> {
        const url = projectId
            ? `${this.baseUrl}/workflows?project_id=${encodeURIComponent(projectId)}`
            : `${this.baseUrl}/workflows`;
        const response = await this.fetchWithRetry(url, { headers: this.getHeaders() });
        if (!response.ok) throw new Error('Failed to fetch workflows');
        return response.json();
    }

    // Clear all data
    async clearData(): Promise<{ status: string; events_deleted: number }> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/clear-data?confirm=true`, {
            method: 'DELETE',
            headers: this.getHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to clear data');
        }

        return response.json();
    }

    // ============================================================================
    // AUTH ENDPOINTS
    // ============================================================================

    async requestOTP(email: string): Promise<{ status: string; message: string }> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/auth/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to request OTP');
        }
        
        return response.json();
    }

    async verifyOTP(email: string, otp: string): Promise<{ status: string; message: string; access_token?: string; token_type?: string; org_id?: string; default_project_id?: string; user_info?: any }> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp }),
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to verify OTP');
        }
        
        const data = await response.json();
        
        if (data.access_token) {
            this.setToken(data.access_token);
        }
        if (data.user_info) {
            this.setUserInfo(data.user_info);
        }
        if (data.org_id) {
            this.setOrgId(data.org_id);
        }
        if (data.default_project_id) {
            this.setProjectId(data.default_project_id);
        }
        
        return data;
    }

    async loginWithSSO(email: string, userName: string, companyName: string, provider: 'google'): Promise<{
        status: string;
        access_token: string;
        token_type: string;
        user_info: { user_name: string; email: string; company_name: string };
    }> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/auth/sso-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                user_name: userName,
                company_name: companyName,
                provider
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || `Failed to sign in with ${provider}`);
        }

        const data = await response.json();

        if (data.access_token) {
            this.setToken(data.access_token);
        }
        if (data.user_info) {
            this.setUserInfo(data.user_info);
        }

        return data;
    }

    async loginWithGoogle(idToken: string): Promise<{
        status: string;
        access_token: string;
        token_type: string;
        user_info: { user_name: string; email: string; company_name: string };
        org_id?: string;
        default_project_id?: string;
    }> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/auth/google-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: idToken }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to sign in with Google');
        }

        const data = await response.json();

        if (data.access_token) {
            this.setToken(data.access_token);
        }
        if (data.user_info) {
            this.setUserInfo(data.user_info);
        }
        if (data.org_id) {
            this.setOrgId(data.org_id);
        }
        if (data.default_project_id) {
            this.setProjectId(data.default_project_id);
        }

        return data;
    }

    // ============================================================================
    // AUDIT SESSION METHODS
    // ============================================================================

    // Create audit session
    async createAuditSession(data: CreateAuditSessionRequest): Promise<AuditSession> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/audit/sessions`, {
            method: 'POST',
            headers: this.getHeaders({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create audit session');
        }

        return response.json();
    }

    // Update audit session with results
    async updateAuditSession(
        sessionId: string,
        data: {
            credit_score?: number;
            total_cost?: number;
            wasted_cost?: number;
            waste_percentage?: number;
            total_events?: number;
            total_workflows?: number;
            issues_found?: number;
            analysis_results?: Record<string, any>;
        }
    ): Promise<AuditSession> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/audit/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: this.getHeaders({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to update audit session');
        }

        return response.json();
    }

    // Get audit session by ID
    async getAuditSession(sessionId: string): Promise<AuditSession> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/audit/sessions/${sessionId}`, { headers: this.getHeaders() });

        if (!response.ok) {
            throw new Error('Failed to fetch audit session');
        }

        return response.json();
    }

    // Get audit history by email
    async getAuditHistory(email: string, skip: number = 0, limit: number = 10): Promise<{
        sessions: AuditSession[];
        total: number;
    }> {
        const response = await this.fetchWithRetry(
            `${this.baseUrl}/audit/history/${encodeURIComponent(email)}?skip=${skip}&limit=${limit}`,
            { headers: this.getHeaders() }
        );

        if (!response.ok) {
            throw new Error('Failed to fetch audit history');
        }

        return response.json();
    }

    // Upload CSV with user information
    async uploadCSVWithUserInfo(
        file: File,
        userInfo: {
            user_name: string;
            email: string;
            company_name: string;
        }
    ): Promise<{
        session: AuditSession;
        upload_result: {
            status: string;
            events_ingested: number;
            upload_session_id: string;
        };
    }> {
        // Persist userInfo for the session so they skip OTP on next uploads
        this.setUserInfo(userInfo);

        // Step 1: Create audit session
        const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'csv';
        const session = await this.createAuditSession({
            user_name: userInfo.user_name,
            email: userInfo.email,
            company_name: userInfo.company_name,
            file_name: file.name,
            file_type: fileExtension,
        });

        // Step 2: Upload file and pass the session ID to link the events
        const uploadResult = await this.uploadCSV(file, session.id);

        return {
            session,
            upload_result: uploadResult,
        };
    }

    // Complete audit flow: upload + analyze + update session
    async completeAudit(
        file: File,
        userInfo: {
            user_name: string;
            email: string;
            company_name: string;
        }
    ): Promise<{
        session: AuditSession;
        summary: ExecutiveSummary;
    }> {
        // Upload with user info
        const { session } = await this.uploadCSVWithUserInfo(file, userInfo);

        // Get analysis scoped to the user's email
        const summary = await this.getExecutiveSummary(userInfo.email);

        // Calculate credit score (0-100 based on waste percentage)
        const creditScore = Math.max(0, Math.min(100,
            Math.round(100 - (summary.executive_summary.waste_percentage || 0))
        ));

        // Update session with results
        const updatedSession = await this.updateAuditSession(session.id, {
            credit_score: creditScore,
            total_cost: summary.executive_summary.current_period_spend,
            wasted_cost: summary.executive_summary.wasted_amount,
            waste_percentage: summary.executive_summary.waste_percentage,
            total_events: summary.total_events,
            total_workflows: summary.workflow_breakdown.length,
            issues_found: summary.top_issues.length,
            analysis_results: summary,
        });

        return {
            session: updatedSession,
            summary,
        };
    }

    // Generate optimizations using backend optimization generator
    async generateOptimization(data: {
        issue_type: string;
        issue_title: string;
        weekly_cost: number;
        one_line_summary: string;
        message: string;
        chat_history?: { role: "assistant" | "user"; text: string }[];
    }): Promise<{ response: string }> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/optimization/generate`, {
            method: 'POST',
            headers: this.getHeaders({
                'Content-Type': 'application/json',
            }),
            body: JSON.stringify({
                issue_type: data.issue_type,
                issue_title: data.issue_title,
                weekly_cost: data.weekly_cost,
                one_line_summary: data.one_line_summary,
                message: data.message,
                chat_history: data.chat_history?.map(msg => ({ role: msg.role, text: msg.text })) || []
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to generate optimization');
        }

        return response.json();
    }

    async getPricingOverrides(companyName: string): Promise<any[]> {
        const response = await this.fetchWithRetry(`${this.baseUrl}/pricing/overrides?company_name=${encodeURIComponent(companyName)}`, {
            method: 'GET',
            headers: this.getHeaders(),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to fetch pricing overrides');
        }

        return response.json();
    }

    async uploadPricingOverrides(file: File, companyName: string): Promise<any> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await this.fetchWithRetry(`${this.baseUrl}/pricing/overrides?company_name=${encodeURIComponent(companyName)}`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to upload pricing overrides');
        }

        return response.json();
    }
}

export const aurexAPI = new AurexAPI();


