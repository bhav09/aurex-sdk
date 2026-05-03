// API Client for Aurex Backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export interface ExecutiveSummary {
    executive_summary: {
        current_weekly_spend: number;
        wasted_amount: number;
        waste_percentage: number;
        optimized_spend: number;
        annual_savings_projection: number;
        period_days: number;
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
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
    metadata: Record<string, any>;
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

export interface CreateAuditSessionRequest {
    user_name: string;
    email: string;
    company_name: string;
    file_name: string;
    file_type: string;
}

export class AurexAPI {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    // Upload CSV with optional clear
    async uploadCSV(file: File, clearExisting: boolean = true): Promise<{
        status: string;
        events_ingested: number;
        upload_session_id: string;
        events_deleted?: number;
    }> {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(
            `${this.baseUrl}/upload/csv?clear_existing=${clearExisting}`,
            {
                method: 'POST',
                body: formData,
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Upload failed');
        }

        return response.json();
    }

    // Get executive summary
    async getExecutiveSummary(): Promise<ExecutiveSummary> {
        const response = await fetch(`${this.baseUrl}/executive-summary`);

        if (!response.ok) {
            throw new Error('Failed to fetch executive summary');
        }

        return response.json();
    }

    // Get individual events with optional filtering
    async getEvents(params?: {
        skip?: number;
        limit?: number;
        workflow_id?: string;
        provider?: string;
        model?: string;
    }): Promise<LLMEvent[]> {
        const queryParams = new URLSearchParams();
        if (params?.skip !== undefined) queryParams.append('skip', params.skip.toString());
        if (params?.limit !== undefined) queryParams.append('limit', params.limit.toString());
        if (params?.workflow_id) queryParams.append('workflow_id', params.workflow_id);
        if (params?.provider) queryParams.append('provider', params.provider);
        if (params?.model) queryParams.append('model', params.model);

        const url = `${this.baseUrl}/events${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Failed to fetch events');
        }

        return response.json();
    }

    // Clear all data
    async clearData(): Promise<{ status: string; events_deleted: number }> {
        const response = await fetch(`${this.baseUrl}/clear-data?confirm=true`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error('Failed to clear data');
        }

        return response.json();
    }

    // ============================================================================
    // AUDIT SESSION METHODS
    // ============================================================================

    // Create audit session
    async createAuditSession(data: CreateAuditSessionRequest): Promise<AuditSession> {
        const response = await fetch(`${this.baseUrl}/audit/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
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
        const response = await fetch(`${this.baseUrl}/audit/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
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
        const response = await fetch(`${this.baseUrl}/audit/sessions/${sessionId}`);

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
        const response = await fetch(
            `${this.baseUrl}/audit/history/${encodeURIComponent(email)}?skip=${skip}&limit=${limit}`
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
        },
        clearExisting: boolean = true
    ): Promise<{
        session: AuditSession;
        upload_result: {
            status: string;
            events_ingested: number;
            upload_session_id: string;
        };
    }> {
        // Step 1: Create audit session
        const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'csv';
        const session = await this.createAuditSession({
            user_name: userInfo.user_name,
            email: userInfo.email,
            company_name: userInfo.company_name,
            file_name: file.name,
            file_type: fileExtension,
        });

        // Step 2: Upload file
        const uploadResult = await this.uploadCSV(file, clearExisting);

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
        },
        clearExisting: boolean = true
    ): Promise<{
        session: AuditSession;
        summary: ExecutiveSummary;
    }> {
        // Upload with user info
        const { session } = await this.uploadCSVWithUserInfo(file, userInfo, clearExisting);

        // Get analysis
        const summary = await this.getExecutiveSummary();

        // Calculate credit score (0-100 based on waste percentage)
        const creditScore = Math.max(0, Math.min(100,
            Math.round(100 - (summary.executive_summary.waste_percentage || 0))
        ));

        // Update session with results
        const updatedSession = await this.updateAuditSession(session.id, {
            credit_score: creditScore,
            total_cost: summary.executive_summary.current_weekly_spend,
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
}

export const aurixAPI = new AurexAPI();

// Made with Bob
