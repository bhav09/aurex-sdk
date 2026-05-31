import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { DocsSidebar } from "@/components/docs/docs-sidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-white selection:bg-emerald-500/30">
      <Navigation />
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 pt-28 pb-12">
        <div className="flex flex-col lg:flex-row gap-12">
          <DocsSidebar />
          <div className="flex-1 max-w-4xl">{children}</div>
        </div>
      </div>
      <FooterSection />
    </div>
  );
}
