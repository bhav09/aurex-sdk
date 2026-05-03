import * as d3 from "d3";
import type { AuditResult } from "./audit";

function fmtUSD(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function renderTimelineChart(container: HTMLElement, data: AuditResult["timeSeriesData"]) {
  container.innerHTML = "";
  if (data.length === 0) {
    container.innerHTML = `<p class="muted-note">No timeline data available.</p>`;
    return;
  }

  const width = container.clientWidth || 600;
  const height = 200;
  const margin = { top: 20, right: 20, bottom: 30, left: 50 };

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", "100%")
    .attr("height", height)
    .attr("viewBox", `0 0 ${width} ${height}`)
    .style("max-width", "100%")
    .style("height", "auto");

  const x = d3
    .scaleTime()
    .domain(d3.extent(data, (d) => new Date(d.timestamp)) as [Date, Date])
    .range([margin.left, width - margin.right]);

  const y = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.estCostUSD) || 1])
    .nice()
    .range([height - margin.bottom, margin.top]);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0))
    .attr("color", "var(--muted)");

  svg
    .append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(
      d3
        .axisLeft(y)
        .ticks(5)
        .tickFormat((d) => "$" + d)
    )
    .attr("color", "var(--muted)");

  // Area
  const area = d3
    .area<typeof data[0]>()
    .x((d) => x(new Date(d.timestamp)))
    .y0(y(0))
    .y1((d) => y(d.estCostUSD));

  svg
    .append("path")
    .datum(data)
    .attr("fill", "var(--accent)")
    .attr("fill-opacity", 0.3)
    .attr("d", area);

  // Line
  const line = d3
    .line<typeof data[0]>()
    .x((d) => x(new Date(d.timestamp)))
    .y((d) => y(d.estCostUSD));

  svg
    .append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "var(--accent)")
    .attr("stroke-width", 2)
    .attr("d", line);

  // Add a simple tooltip overlay layer
  const tooltip = d3
    .select(container)
    .append("div")
    .style("position", "absolute")
    .style("background", "var(--panel)")
    .style("border", "1px solid var(--border)")
    .style("border-radius", "4px")
    .style("padding", "4px 8px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", 0);

  svg
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => x(new Date(d.timestamp)))
    .attr("cy", (d) => y(d.estCostUSD))
    .attr("r", 4)
    .attr("fill", "var(--accent)")
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => {
      tooltip.transition().duration(200).style("opacity", 1);
      tooltip
        .html(`<div>${new Date(d.timestamp).toLocaleTimeString()}</div><div>${fmtUSD(d.estCostUSD)}</div>`)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 28 + "px");
    })
    .on("mouseout", () => {
      tooltip.transition().duration(500).style("opacity", 0);
    });
}

export function renderDonutChart(container: HTMLElement, data: AuditResult["modelSpendData"]) {
  container.innerHTML = "";
  if (data.length === 0) {
    container.innerHTML = `<p class="muted-note">No model spend data.</p>`;
    return;
  }

  const width = container.clientWidth || 300;
  const height = 300;
  const margin = 20;

  const radius = Math.min(width, height) / 2 - margin;

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  const color = d3.scaleOrdinal(d3.schemeCategory10).domain(data.map((d) => d.model));

  const pie = d3.pie<typeof data[0]>().value((d) => d.estCostUSD).sort(null);
  const data_ready = pie(data);

  const arcGenerator = d3
    .arc<d3.PieArcDatum<typeof data[0]>>()
    .innerRadius(radius * 0.5)
    .outerRadius(radius * 0.8);

  const hoverArc = d3
    .arc<d3.PieArcDatum<typeof data[0]>>()
    .innerRadius(radius * 0.5)
    .outerRadius(radius * 0.85);

  const tooltip = d3
    .select(container)
    .append("div")
    .style("position", "absolute")
    .style("background", "var(--panel)")
    .style("border", "1px solid var(--border)")
    .style("border-radius", "4px")
    .style("padding", "4px 8px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", 0);

  svg
    .selectAll("allSlices")
    .data(data_ready)
    .enter()
    .append("path")
    .attr("d", arcGenerator)
    .attr("fill", (d) => color(d.data.model) as string)
    .attr("stroke", "var(--panel)")
    .style("stroke-width", "2px")
    .style("cursor", "pointer")
    .on("mouseover", function (event, d) {
      d3.select(this).transition().duration(200).attr("d", hoverArc as any);
      tooltip.transition().duration(200).style("opacity", 1);
      tooltip
        .html(`<div><strong>${d.data.model}</strong></div><div>${fmtUSD(d.data.estCostUSD)}</div>`)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 28 + "px");
    })
    .on("mouseout", function () {
      d3.select(this).transition().duration(200).attr("d", arcGenerator as any);
      tooltip.transition().duration(500).style("opacity", 0);
    });
}
