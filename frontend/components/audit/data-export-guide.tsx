import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Info, ExternalLink, Database, HelpCircle, Code } from "lucide-react";
import React from "react";

export function DataExportGuide() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground hover:text-primary">
                    <HelpCircle className="w-4 h-4 mr-1.5" />
                    Need help finding your usage data? View export guide
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="text-2xl font-display">How to export your LLM usage data</DialogTitle>
                    <DialogDescription>
                        Follow these steps to export your token usage logs from major AI providers for analysis in Aurex.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="openai" className="mt-4">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="openai">OpenAI</TabsTrigger>
                        <TabsTrigger value="anthropic">Anthropic</TabsTrigger>
                        <TabsTrigger value="gcp">GCP Vertex AI</TabsTrigger>
                        <TabsTrigger value="aws">AWS Bedrock</TabsTrigger>
                    </TabsList>

                    {/* OpenAI Tab */}
                    <TabsContent value="openai" className="mt-6 space-y-6 focus-visible:outline-none min-h-[420px]">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Database className="w-5 h-5 text-primary" />
                                Dashboard Method
                            </h3>
                            <ol className="list-decimal pl-5 space-y-3 text-sm text-muted-foreground">
                                <li>Navigate to the <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center">OpenAI API Usage Dashboard <ExternalLink className="w-3 h-3 ml-1" /></a>.</li>
                                <li>Sign in and select your organization/project.</li>
                                <li>Set your desired date range using the date range picker (e.g., past 30 days).</li>
                                <li>Click the <strong>Export</strong> button in the top-right corner.</li>
                                <li>Choose <strong>Activity data</strong> for detailed usage activity, or <strong>Cost data</strong> for spend reporting.</li>
                                <li>Click <strong>Download</strong> to generate your CSV file.</li>
                            </ol>
                            <Alert className="mt-4 bg-muted/50">
                                <Info className="h-4 w-4" />
                                <AlertTitle>Tip</AlertTitle>
                                <AlertDescription>
                                    Depending on your data volume, generating the CSV export may take a few minutes. Dates and times are displayed in UTC.
                                </AlertDescription>
                            </Alert>
                        </div>

                        <div className="space-y-4 pt-6 border-t border-border">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Code className="w-5 h-5 text-primary" />
                                Programmatic / API Method
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                For automated or custom analysis, you can use the Usage API and Costs API.
                            </p>
                            <div className="bg-muted rounded-md p-4 border border-border/50">
                                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                                    {`GET https://api.openai.com/v1/organization/costs`}
                                </pre>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                This endpoint retrieves cost details with parameters for filtering by time range, project IDs, and grouping options.
                            </p>
                        </div>
                    </TabsContent>

                    {/* Anthropic Tab */}
                    <TabsContent value="anthropic" className="mt-6 space-y-6 focus-visible:outline-none min-h-[420px]">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Database className="w-5 h-5 text-primary" />
                                Console Method
                            </h3>
                            <ol className="list-decimal pl-5 space-y-3 text-sm text-muted-foreground">
                                <li>Navigate to the <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center">Claude Console <ExternalLink className="w-3 h-3 ml-1" /></a>.</li>
                                <li>Go to the <strong>Usage</strong> page from the sidebar.</li>
                                <li>Filter the usage data by workspace, model, month, and API key as needed.</li>
                                <li>Click the <strong>CSV export button</strong> to download your usage data for analysis.</li>
                            </ol>
                        </div>

                        <div className="space-y-4 pt-6 border-t border-border">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Code className="w-5 h-5 text-primary" />
                                Programmatic / API Method
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Use the Usage and Cost Admin API to fetch detailed token consumption programmatically. Requires an Admin API key (`sk-ant-admin...`).
                            </p>
                            <div className="bg-muted rounded-md p-4 border border-border/50">
                                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
{`curl "https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=2026-01-01T00:00:00Z&bucket_width=1d" \\
  --header "anthropic-version: 2023-06-01" \\
  --header "x-api-key: $ANTHROPIC_ADMIN_KEY"`}
                                </pre>
                            </div>
                        </div>
                    </TabsContent>

                    {/* GCP Vertex AI Tab */}
                    <TabsContent value="gcp" className="mt-6 space-y-6 focus-visible:outline-none min-h-[420px]">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Database className="w-5 h-5 text-primary" />
                                Console Method
                            </h3>
                            <ol className="list-decimal pl-5 space-y-3 text-sm text-muted-foreground">
                                <li>Navigate to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center">Google Cloud Console <ExternalLink className="w-3 h-3 ml-1" /></a>.</li>
                                <li>Enable <strong>Cloud Audit Logs</strong> for Vertex AI.</li>
                                <li>This captures metadata about Vertex AI API calls including caller identity, model ID, method, and timestamp.</li>
                                <li>Configure a log sink to export these logs to Cloud Storage as JSON/CSV.</li>
                            </ol>
                        </div>

                        <div className="space-y-4 pt-6 border-t border-border">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Code className="w-5 h-5 text-primary" />
                                Programmatic / Automated Method
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                To capture actual prompt/response payloads and exact token metrics, enable request-response logging directly to BigQuery.
                            </p>
                            <div className="bg-muted rounded-md p-4 border border-border/50">
                                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
{`# Python SDK example for Gemini/Claude on Vertex AI
import vertexai

vertexai.init(
    project="your-project",
    location="us-central1",
    request_response_logging_config={
        "enabled": True,
        "sampling_rate": 1.0,
        "bigquery_destination": "bq://your-project.dataset.table"
    }
)`}
                                </pre>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                You can export the resulting BigQuery table to CSV via the Google Cloud Console.
                            </p>
                        </div>
                    </TabsContent>

                    {/* AWS Bedrock Tab */}
                    <TabsContent value="aws" className="mt-6 space-y-6 focus-visible:outline-none min-h-[420px]">
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Database className="w-5 h-5 text-primary" />
                                Console Method
                            </h3>
                            <ol className="list-decimal pl-5 space-y-3 text-sm text-muted-foreground">
                                <li>Navigate to the <a href="https://console.aws.amazon.com/bedrock/home" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center">AWS Management Console <ExternalLink className="w-3 h-3 ml-1" /></a> and open <strong>Amazon Bedrock</strong>.</li>
                                <li>In the navigation pane, choose <strong>Settings</strong>.</li>
                                <li>Toggle <strong>Model invocation logging</strong> to enabled.</li>
                                <li>Choose an S3 bucket or CloudWatch Logs as the destination.</li>
                                <li>If you selected S3, you can download the logs directly as JSON lines files.</li>
                            </ol>
                        </div>

                        <div className="space-y-4 pt-6 border-t border-border">
                            <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                <Code className="w-5 h-5 text-primary" />
                                Programmatic / Automated Method
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                For billing-focused audits, enable AWS Cost &amp; Usage Reports to automatically receive CSV exports.
                            </p>
                            <ol className="list-decimal pl-5 space-y-3 text-sm text-muted-foreground">
                                <li>Go to the <a href="https://console.aws.amazon.com/billing/home" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center">AWS Billing Console <ExternalLink className="w-3 h-3 ml-1" /></a>.</li>
                                <li>Select <strong>Cost &amp; Usage Reports</strong>.</li>
                                <li>Create a report and select Amazon S3 as the destination.</li>
                                <li>AWS will deliver detailed billing CSVs containing Bedrock inference costs, broken down by model and invocation counts.</li>
                            </ol>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}