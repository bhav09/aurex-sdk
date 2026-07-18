"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { Menu, X, ArrowLeft } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { aurexAPI } from "@/lib/api-client";
import { AuthModal } from "./auth-modal";
import { UserDropdown } from "@/components/app/user-dropdown";

import { useTheme } from "next-themes";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navLinks = [
  { name: "Docs", href: "/docs" },
  { name: "Changelog", href: "/changelog" },
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isHomePage = pathname === "/";
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setHasSession(aurexAPI.hasActiveSession());
  }, []);

  return (
    <header
      className={`fixed z-50 transition-all duration-500 ${isScrolled
        ? "top-4 left-4 right-4"
        : "top-0 left-0 right-0"
        }`}
    >
      <nav
        className={`mx-auto transition-all duration-500 ${isScrolled || isMobileMenuOpen
          ? "bg-background/80 backdrop-blur-xl border border-foreground/10 rounded-2xl shadow-lg max-w-[1200px]"
          : "bg-transparent max-w-[1400px]"
          }`}
      >
        <div
          className={`flex items-center justify-between transition-all duration-500 px-6 lg:px-8 ${isScrolled ? "h-14" : "h-20"
            }`}
        >
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 group">
            <Image
              src={mounted && resolvedTheme === "light" ? "/heyaurex_logo/2.png" : "/heyaurex_logo/1.png"}
              alt="AUREX logo"
              width={140}
              height={120}
              className={`w-auto transition-all duration-500 ${isScrolled ? "h-8" : "h-10"}`}
              priority
            />
            <span className={`font-serif uppercase tracking-[0.2em] font-medium transition-all duration-500 ${isScrolled ? "text-xl text-foreground" : "text-2xl text-white"}`}>
              Aurex
            </span>
            <span className="px-1.5 py-0.5 rounded-sm bg-amber-500/10 text-amber-500 text-[10px] font-bold uppercase tracking-wider border border-amber-500/20">
              Beta
            </span>
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">

            {navLinks.map((link) => (
              <a
                key={link.name}
                id={`nav-link-${link.name.toLowerCase().replace(/\s+/g, "-")}`}
                href={link.href}
                className={`text-sm transition-colors duration-300 relative group ${isScrolled ? "text-foreground/70 hover:text-foreground" : "text-white/70 hover:text-white"}`}
              >
                {link.name}
                <span className={`absolute -bottom-1 left-0 w-0 h-px transition-all duration-300 group-hover:w-full ${isScrolled ? "bg-foreground" : "bg-white"}`} />
              </a>
            ))}

            {hasSession ? (
              <div className="flex items-center gap-4 border-l border-white/[0.08] pl-6 ml-2 text-white">
                <ThemeToggle />
                <UserDropdown />
              </div>
            ) : (
              <div className="flex items-center gap-4 border-l border-white/[0.08] pl-6 ml-2">
                <ThemeToggle />
                <button
                  onClick={() => setIsAuthOpen(true)}
                  className={`px-4 py-1.5 text-xs font-semibold rounded-full transition-all duration-300 ${isScrolled ? "text-foreground hover:bg-foreground/5" : "text-white hover:bg-white/10"}`}
                >
                  Sign In
                </button>
                <a
                  href="/docs#quickstart"
                  className="px-4 py-1.5 text-xs font-semibold bg-teal-500 text-white hover:bg-teal-400 rounded-full transition-all duration-300 shadow-[0_4px_12px_rgba(20,184,166,0.3)]"
                >
                  Get started free
                </a>
              </div>
            )}
          </div>

          {/* Mobile Navigation - Back button or Menu */}
          <div className="md:hidden flex items-center gap-2">
            {!isHomePage && (
              <button
                onClick={() => router.back()}
                className={`p-2 transition-colors duration-500 ${isScrolled || isMobileMenuOpen ? "text-foreground" : "text-white"}`}
                aria-label="Go back"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            )}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`p-2 transition-colors duration-500 ${isScrolled || isMobileMenuOpen ? "text-foreground" : "text-white"}`}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu - Full Screen Overlay */}
      <div
        className={`md:hidden fixed inset-0 bg-background z-40 transition-all duration-500 ${isMobileMenuOpen
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
          }`}
        style={{ top: 0 }}
      >
        <div className="flex flex-col h-full px-8 pt-28 pb-8">
          {/* Navigation Links */}
          <div className="flex-1 flex flex-col justify-center gap-6">
            {navLinks.map((link, i) => (
              <a
                key={link.name}
                id={`mobile-nav-link-${link.name.toLowerCase().replace(/\s+/g, "-")}`}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`text-4xl font-display text-foreground hover:text-muted-foreground transition-all duration-500 ${isMobileMenuOpen
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4"
                  }`}
                style={{ transitionDelay: isMobileMenuOpen ? `${i * 75}ms` : "0ms" }}
              >
                {link.name}
              </a>
            ))}

            <div className="mt-8 pt-6 border-t border-foreground/10 flex flex-col gap-4">
              {hasSession ? (
                <div className="flex flex-col gap-3">
                  <a
                    href="/app/profile"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full py-3 text-center text-sm font-semibold bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-white rounded-xl transition-all duration-300"
                  >
                    Profile
                  </a>
                  <a
                    href="/app/settings"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full py-3 text-center text-sm font-semibold bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] text-white rounded-xl transition-all duration-300"
                  >
                    Settings
                  </a>
                  <button
                    onClick={() => {
                      aurexAPI.clearSession();
                      setHasSession(false);
                      setIsMobileMenuOpen(false);
                      router.push("/");
                    }}
                    className="w-full py-3 text-center text-sm font-semibold border border-rose-500/10 hover:bg-rose-500/5 rounded-xl transition-all duration-300 text-rose-400"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsAuthOpen(true);
                  }}
                  className="w-full py-3 text-center text-sm font-semibold bg-foreground text-background hover:opacity-90 rounded-xl transition-all duration-300"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
    </header>
  );
}

