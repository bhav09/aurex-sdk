import React from "react";
import { ProcessedDataSummary } from "@/lib/data-processor";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DataExpanderProps {
  summary: ProcessedDataSummary;
}

export function DataExpander({ summary }: DataExpanderProps) {
  if (!summary) return null;

  return (
    <div className="w-full max-w-4xl mx-auto my-6 border rounded-lg overflow-hidden bg-background">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="data" className="border-b-0">
          <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-base">Processed Data Context</span>
              <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                {summary.rowCount} rows parsed
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6 pt-2">
            <div className="space-y-8 mt-4">
              {/* Numeric Summaries */}
              {Object.keys(summary.numericSummaries).length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Numeric Columns
                  </h4>
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Column</TableHead>
                          <TableHead className="text-right">Min</TableHead>
                          <TableHead className="text-right">Max</TableHead>
                          <TableHead className="text-right">Average</TableHead>
                          <TableHead className="text-right">Sum</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(summary.numericSummaries).map(([col, stats]) => (
                          <TableRow key={col}>
                            <TableCell className="font-medium">{col}</TableCell>
                            <TableCell className="text-right">{stats.min}</TableCell>
                            <TableCell className="text-right">{stats.max}</TableCell>
                            <TableCell className="text-right">{stats.average}</TableCell>
                            <TableCell className="text-right">{stats.sum}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Categorical Summaries */}
              {Object.keys(summary.categoricalSummaries).length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                    Categorical Columns (Top Values)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(summary.categoricalSummaries).map(([col, stats]) => (
                      <div key={col} className="border rounded-md p-4 bg-muted/20">
                        <div className="flex justify-between items-center mb-3">
                          <span className="font-medium">{col}</span>
                          <span className="text-xs text-muted-foreground">{stats.uniqueCount} unique</span>
                        </div>
                        <div className="space-y-2">
                          {Object.entries(stats.topValues).map(([val, count]) => (
                            <div key={val} className="flex justify-between text-sm">
                              <span className="truncate pr-4 text-muted-foreground">{val || "(empty)"}</span>
                              <span className="font-mono">{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
