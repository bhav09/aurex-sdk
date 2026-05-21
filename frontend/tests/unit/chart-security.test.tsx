import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { ChartContainer } from '../../components/ui/chart';

describe('ChartContainer Security', () => {
    it('sanitizes CSS custom properties to prevent CSS injection', () => {
        const maliciousConfig = {
            hacked: {
                label: "Hacked Data",
                theme: {
                    light: 'red; background-image: url("http://malicious.com/tracker");',
                    dark: 'blue; display: none;'
                }
            }
        };

        const { container } = render(
            <ChartContainer config={maliciousConfig as any}>
                <div data-testid="chart-child">Chart Content</div>
            </ChartContainer>
        );

        // Extract the generated <style> tag content
        const styleElement = container.querySelector('style');
        expect(styleElement).not.toBeNull();
        
        const styleContent = styleElement?.innerHTML || '';

        // Verify that the malicious payload has been sanitized
        // Quotes should be stripped by the regex in ChartStyle
        expect(styleContent).not.toContain('"');
        
        // Ensure it did not inject new rules successfully
        expect(styleContent).not.toMatch(/background-image:\s*url/);
        expect(styleContent).not.toMatch(/display:\s*none/);

        // Verify that the color declaration is present but neutralized
        // E.g. "red background-image url(httpmalicious.comtracker)"
        expect(styleContent).toContain('--color-hacked: red background-image url(httpmalicious.comtracker)');
    });
});
