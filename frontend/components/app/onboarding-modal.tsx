"use client";

import { useEffect, useState } from "react";
import { aurexAPI } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Building2, FolderKanban, ShieldCheck } from "lucide-react";

interface OnboardingModalProps {
  isOpen: boolean;
  onSuccess: () => void;
}

export function OnboardingModal({ isOpen, onSuccess }: OnboardingModalProps) {
  const [orgName, setOrgName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [environment, setEnvironment] = useState<"dev" | "staging" | "prod">("dev");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<{ id: string; org_id: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function checkDefaultProject() {
      try {
        const projects = await aurexAPI.listProjects();
        const defaultProject = projects.find((p) => p.name === "Default" || p.name === "default");
        if (defaultProject) {
          setProjectData({ id: defaultProject.id, org_id: defaultProject.org_id });
          setProjectName(""); // Allow user to type fresh name
          
          // Prepopulate default org name if user info has email
          const info = aurexAPI.getUserInfo();
          if (info?.email) {
            const prefix = info.email.split("@")[0];
            setOrgName(`${prefix.charAt(0).toUpperCase() + prefix.slice(1)}'s Org`);
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch default onboarding info", err);
      }
    }

    void checkDefaultProject();
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName || !projectName || !projectData) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Update Organization name
      await aurexAPI.updateOrganization(projectData.org_id, orgName);
      
      // 2. Update default project name & environment
      await aurexAPI.updateProject(projectData.id, {
        name: projectName,
        environment,
      });

      // 3. Complete onboarding
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to configure your environment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[480px] bg-[#0A0A0A]/95 border-white/[0.08] text-white backdrop-blur-2xl rounded-2xl shadow-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-2xl font-serif tracking-wide uppercase text-white/90">
            Welcome to Aurex
          </DialogTitle>
          <DialogDescription className="text-white/60 text-sm">
            Let&rsquo;s configure your default environment. This helps you track LLM usage, cache performance, and cost savings properly.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5 py-2">
          <div className="space-y-4">
            {/* Organization Input */}
            <div className="space-y-1.5">
              <Label htmlFor="org-name" className="text-white/70 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-white/40" />
                Organization Name
              </Label>
              <Input
                id="org-name"
                required
                placeholder="e.g. Acme Corp"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/[0.15] focus:ring-1 focus:ring-white/20 text-white placeholder-white/30 rounded-xl"
              />
            </div>

            {/* Project Input */}
            <div className="space-y-1.5">
              <Label htmlFor="project-name" className="text-white/70 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                <FolderKanban className="w-3.5 h-3.5 text-white/40" />
                First Project Name
              </Label>
              <Input
                id="project-name"
                required
                placeholder="e.g. LLM Assistant"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/[0.15] focus:ring-1 focus:ring-white/20 text-white placeholder-white/30 rounded-xl"
              />
            </div>

            {/* Environment Select */}
            <div className="space-y-1.5">
              <Label className="text-white/70 text-xs font-medium uppercase tracking-wider">
                Project Environment
              </Label>
              <Select
                value={environment}
                onValueChange={(val) => setEnvironment(val as "dev" | "staging" | "prod")}
              >
                <SelectTrigger className="h-11 bg-white/[0.02] border-white/[0.08] focus:border-white/[0.15] text-white rounded-xl">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent className="bg-[#0A0A0A] border-white/[0.08] text-white">
                  <SelectItem value="dev">Development (dev)</SelectItem>
                  <SelectItem value="staging">Staging (staging)</SelectItem>
                  <SelectItem value="prod">Production (prod)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || !orgName || !projectName}
            className="w-full h-11 mt-2 bg-white hover:bg-white/90 text-black font-semibold rounded-xl transition-all duration-300 shadow-[0_4px_20px_rgba(255,255,255,0.15)]"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                Complete Setup & Go to App
                <ShieldCheck className="w-4 h-4" />
              </span>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
