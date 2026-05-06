import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { CsvInsights } from "@/components/insights/csv-insights";

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
