"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Bot, FileText, ArrowRight, Search, Loader2 } from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

export function Omnibar() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [mode, setMode] = React.useState<"search" | "ask">("search")
  const [aiResponse, setAiResponse] = React.useState("")
  const [isLoading, setIsLoading] = React.useState(false)
  const router = useRouter()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const runCommand = React.useCallback((command: () => void) => {
    setOpen(false)
    command()
  }, [])

  const handleAsk = async () => {
    if (!query) return
    setMode("ask")
    setIsLoading(true)
    setAiResponse("")

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setAiResponse(data.answer)
    } catch (err) {
      setAiResponse("I'm sorry, I couldn't reach the AI backend right now. Please try again later.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      {mode === "search" ? (
        <>
          <CommandInput 
            placeholder="Type a command or search..." 
            value={query} 
            onValueChange={setQuery}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.length > 3) {
                // If it doesn't match standard items, we might want to ask AI
              }
            }}
          />
          <CommandList>
            <CommandEmpty>
              No results found.
              <div className="mt-4 flex justify-center">
                <button
                  onClick={handleAsk}
                  className="flex items-center gap-2 rounded-md bg-teal-500/10 px-4 py-2 text-sm font-medium text-teal-400 hover:bg-teal-500/20"
                >
                  <Bot className="h-4 w-4" />
                  Ask AI Assistant
                </button>
              </div>
            </CommandEmpty>
            
            {query && (
              <CommandGroup heading="AI Assistant">
                <CommandItem onSelect={handleAsk} className="text-teal-400 cursor-pointer">
                  <Bot className="mr-2 h-4 w-4" />
                  Ask Aurex: &quot;{query}&quot;
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading="Documentation">
              <CommandItem onSelect={() => runCommand(() => router.push("/docs/installation"))}>
                <FileText className="mr-2 h-4 w-4" />
                Installation & Quick Start
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/docs/deployment"))}>
                <FileText className="mr-2 h-4 w-4" />
                Cloud Deployment
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/docs/reference"))}>
                <FileText className="mr-2 h-4 w-4" />
                API Reference
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/docs/reliability"))}>
                <FileText className="mr-2 h-4 w-4" />
                Reliability & Loss Recovery
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Account">
              <CommandItem onSelect={() => runCommand(() => router.push("/app/settings"))}>
                <Search className="mr-2 h-4 w-4" />
                Settings
              </CommandItem>
              <CommandItem onSelect={() => runCommand(() => router.push("/app/api-keys"))}>
                <Search className="mr-2 h-4 w-4" />
                API Keys
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </>
      ) : (
        <div className="flex flex-col h-full max-h-[400px]">
          <div className="flex items-center border-b px-4 py-3">
            <button
              onClick={() => setMode("search")}
              className="mr-2 rounded-md p-1 hover:bg-white/10"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
            </button>
            <div className="flex-1 font-medium text-sm">Ask Aurex</div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-white/10 p-2">
                <Search className="h-4 w-4" />
              </div>
              <div className="flex-1 rounded-lg bg-white/5 p-3 text-sm">
                {query}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-teal-500/20 p-2 text-teal-400">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex-1 rounded-lg bg-teal-500/10 p-3 text-sm text-teal-100">
                {isLoading ? (
                  <div className="flex items-center gap-2 text-teal-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching documentation...
                  </div>
                ) : (
                  <div className="prose prose-invert max-w-none prose-sm">
                    {aiResponse}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </CommandDialog>
  )
}
