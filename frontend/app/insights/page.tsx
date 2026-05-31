"use client";

import dynamic from "next/dynamic";
import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";

const CsvInsights = dynamic(
  () => import("@/components/insights/csv-insights").then((mod) => mod.CsvInsights),
  { ssr: false }
);

export default function InsightsPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden flex flex-col">
      <Navigation />
      <div className="flex-1 pt-24 pb-16">
        <CsvInsights />
      </div>
      <FooterSection />
    </main>
  );
}
