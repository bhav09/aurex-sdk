import Papa from 'papaparse';

export interface ProcessedDataSummary {
  rowCount: number;
  columns: string[];
  numericSummaries: Record<string, { min: number; max: number; average: number; sum: number }>;
  categoricalSummaries: Record<string, { uniqueCount: number; topValues: Record<string, number> }>;
  sampleData: any[];
}

export const processCSVFile = (file: File): Promise<ProcessedDataSummary> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true, // Automatically convert numbers and booleans
      complete: (results) => {
        try {
          const data = results.data as any[];
          const summary = aggregateData(data);
          resolve(summary);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};

const aggregateData = (data: any[]): ProcessedDataSummary => {
  if (data.length === 0) {
    throw new Error("CSV file is empty");
  }

  const columns = Object.keys(data[0]);
  const numericSummaries: Record<string, any> = {};
  const categoricalSummaries: Record<string, any> = {};
  
  // First pass to determine column types and collect data
  const colData: Record<string, any[]> = {};
  columns.forEach(col => {
    colData[col] = data.map(row => row[col]);
  });

  columns.forEach(col => {
    const values = colData[col].filter(v => v !== null && v !== undefined && v !== '');
    if (values.length === 0) return;

    // Check if column is numeric
    const isNumeric = values.every(v => typeof v === 'number');

    if (isNumeric) {
      const numbers = values as number[];
      const sum = numbers.reduce((a, b) => a + b, 0);
      numericSummaries[col] = {
        min: Math.min(...numbers),
        max: Math.max(...numbers),
        average: Number((sum / numbers.length).toFixed(2)),
        sum: Number(sum.toFixed(2))
      };
    } else {
      // Categorical
      const counts: Record<string, number> = {};
      values.forEach(v => {
        const strVal = String(v);
        counts[strVal] = (counts[strVal] || 0) + 1;
      });

      // Get top 5 most frequent values
      const topValuesEntries = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
        
      const topValues = Object.fromEntries(topValuesEntries);

      categoricalSummaries[col] = {
        uniqueCount: Object.keys(counts).length,
        topValues
      };
    }
  });

  return {
    rowCount: data.length,
    columns,
    numericSummaries,
    categoricalSummaries,
    // Take a small sample to give LLM some concrete context
    sampleData: data.slice(0, 3)
  };
};
