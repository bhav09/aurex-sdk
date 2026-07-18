import React from "react"
import type { Metadata } from 'next'
import { Inter, Outfit, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { ThemeProvider } from "@/components/theme-provider"
import { Omnibar } from "@/components/ui/omnibar"
const inter = Inter({
  subsets: ["latin"],
  variable: '--font-inter'
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: '--font-outfit'
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: '--font-jetbrains'
});

export const metadata: Metadata = {
  title: 'Aurex - Token Waste Prevention Platform',
  description: 'Stop AI token waste before it fires. In-process SDK that detects loops, compresses prompts, routes to cheaper models, and fails over between providers.',
  generator: 'v0.app',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem={true}
          disableTransitionOnChange
        >
          {children}
          <Omnibar />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
