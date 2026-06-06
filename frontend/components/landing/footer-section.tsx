"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useRef } from "react";

const footerLinks = {
  Pillars: [
    { name: "LoopGuard", href: "/#pillars" },
    { name: "PromptIQ", href: "/#pillars" },
    { name: "CascadeRouter", href: "/#pillars" },
    { name: "ProviderShield", href: "/#pillars" },
  ],
  Resources: [
    { name: "Documentation", href: "/docs" },
    { name: "Support", href: "mailto:contact@heyaurex.com" },
    { name: "Contact", href: "mailto:contact@heyaurex.com" },
  ],
  Legal: [
    { name: "Privacy", href: "/privacy" },
    { name: "Terms", href: "/terms" },
  ],
};

const socialLinks = [
  { name: "LinkedIn", href: "https://www.linkedin.com/company/heyaurex" },
  { name: "Twitter", href: "https://www.x.com/heyaurex" },
];

function AnimatedWaveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener("resize", resize);

    const animate = () => {
      const width = canvas.offsetWidth;
      const height = canvas.offsetHeight;
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = "rgba(100, 200, 150, 0.3)";
      ctx.lineWidth = 1;

      for (let wave = 0; wave < 3; wave++) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += 5) {
          const y =
            height * 0.5 +
            Math.sin(x * 0.01 + time + wave * 0.5) * 30 +
            Math.sin(x * 0.02 + time * 1.5 + wave) * 20;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      time += 0.02;
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
}

export function FooterSection() {
  return (
    <footer className="relative bg-background">
      {/* Panoramic banner image */}
      {/* <div className="relative w-full h-[340px] md:h-[420px] overflow-hidden"> */}
        {/* <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Upscaled%20Image%20%2810%29-UnDKstODkIENp5xqTYUEpt0Sm8tNOw.png"
          alt="Bioluminescent landscape"
          className="w-full h-full object-cover object-center"
        /> */}
        {/* Gradient fade to black at bottom */}
        {/* <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black" /> */}
        {/* Subtle dark vignette on sides */}
        {/* <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" /> */}
      {/* </div> */}

      {/* Footer content — black background, white text */}
      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Main Footer */}
        <div className="py-16 lg:py-20">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-12 lg:gap-8">
            {/* Brand Column */}
            <div className="col-span-2">
              <a href="/" className="inline-flex items-center gap-2 mb-6">
                <span className="text-2xl font-display text-white">AUREX</span>
                <span className="text-xs text-white/40 font-mono">TM</span>
              </a>

              <p className="text-white/50 leading-relaxed mb-8 max-w-xs text-sm font-mono">
                Token waste prevention platform
              </p>

              {/* Social Links */}
              <div className="flex gap-6">
                {socialLinks.map((link) => (
                  <a
                    key={link.name}
                    href={link.href}
                    className="text-sm text-white/40 hover:text-white transition-colors flex items-center gap-1 group"
                  >
                    {link.name}
                    <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </a>
                ))}
              </div>
            </div>

            {/* Link Columns */}
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium text-white mb-6">{title}</h3>
                <ul className="space-y-4">
                  {links.map((link) => (
                    <li key={link.name}>
                      <a
                        id={`footer-link-${link.name.toLowerCase().replace(/\s+/g, "-")}`}
                        href={link.href}
                        className="text-sm text-white/40 hover:text-white transition-colors"
                      >
                        {link.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            
            {/* Install block */}
            <div className="col-span-2 md:col-span-2">
              <h3 className="text-sm font-medium text-white mb-6">Install SDK</h3>
              <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 font-mono text-sm text-white/70 flex items-center justify-between group cursor-pointer hover:bg-white/[0.05] transition-colors"
                onClick={() => navigator.clipboard.writeText('pip install aurex-sdk')}>
                <span><span className="text-emerald-400">$</span> pip install aurex-sdk</span>
                <span className="text-xs text-white/30 opacity-0 group-hover:opacity-100 transition-opacity">Copy</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="py-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/30">
            &copy; 2026 AUREX. All rights reserved.
          </p>

          <div className="flex items-center gap-4 text-sm text-white/30">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
