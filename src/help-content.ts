/** Progressive disclosure: short summaries, details closed by default. */
export function whereToGetLogsHtml(): string {
  return `
    <section class="help-section" id="find-export" aria-labelledby="find-export-title">
      <details class="help-drawer">
        <summary>
          <span class="help-summary-main" id="find-export-title">Where do I get an export?</span>
          <span class="help-summary-hint">OpenAI · Google Cloud · Your API gateway</span>
        </summary>
        <div class="help-drawer-body">
          <p class="help-kicker">You need rows with <strong>time</strong>, <strong>model</strong>, <strong>tokens</strong>; prompts help catch duplicates.</p>

          <details class="help-details">
            <summary>OpenAI</summary>
            <ul class="steps-compact">
              <li><a href="https://platform.openai.com/usage" rel="noopener noreferrer" target="_blank">Usage</a> for totals — row-level prompts usually come from your app or gateway.</li>
              <li>Log <code>usage.prompt_tokens</code> + <code>completion_tokens</code> from each API response.</li>
              <li><a href="https://platform.openai.com/settings/organization/billing/overview" rel="noopener noreferrer" target="_blank">Billing</a> for finance-level denominators.</li>
            </ul>
          </details>

          <details class="help-details">
            <summary>Vertex / Gemini (Google Cloud)</summary>
            <ul class="steps-compact">
              <li><strong>Billing export</strong> (BigQuery) for cost lines.</li>
              <li><strong>Vertex AI / APIs</strong> in <a href="https://console.cloud.google.com/" rel="noopener noreferrer" target="_blank">Cloud Console</a> for activity — row detail often from your service.</li>
              <li>Log model id + token metadata from each response in your integration.</li>
            </ul>
          </details>

          <details class="help-details">
            <summary>No prompts in the file?</summary>
            <p class="steps-note">You can still analyze spend bursts and model mix. Duplicate detection needs repeated prompts (or hashes).</p>
          </details>
        </div>
      </details>
    </section>
  `;
}
