import { Navigation } from "@/components/landing/navigation";
import { FooterSection } from "@/components/landing/footer-section";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { TableOfContents } from "@/components/docs/table-of-contents";
import { DocsBreadcrumbs } from "@/components/docs/docs-breadcrumbs";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-white selection:bg-teal-500/30">
      <Navigation />
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 pt-28 pb-12">
        <div className="flex flex-col lg:flex-row gap-12">
          <div className="w-64 shrink-0 hidden lg:block border-r border-white/10 pr-6">
            <DocsSidebar />
          </div>
          <div className="flex-1 max-w-3xl min-w-0">
            <DocsBreadcrumbs />
            {children}
          </div>
          <div className="w-64 shrink-0 hidden xl:block pl-6 border-l border-white/10">
            <TableOfContents />
          </div>
        </div>
      </div>
      <FooterSection />
    </div>
  );
}
