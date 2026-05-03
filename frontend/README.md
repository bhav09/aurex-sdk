# Aurex Frontend

> **Beautiful. Fast. Insightful.** The UI that makes LLM cost optimization feel like magic.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set backend URL
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > .env.local

# 3. Run dev server
npm run dev

# 4. Open http://localhost:3000
```

## What You Get

- **Landing Page** - Animated hero, features, pricing, testimonials
- **Audit Dashboard** - Upload → Analyze → Get your Token Credit Score
- **Data View** - Color-coded table showing exactly where you're bleeding money
- **Insights Tab** - Top 5 issues ranked by cost impact

## Key Features

- **Drag & Drop Upload** - CSV, JSON, XLSX support
- **Real-time Analysis** - Progress tracking with 9-step simulation
- **Credit Score Card** - Neumorphic design with rotating text
- **Dark Theme** - Premium oklch color space
- **Responsive** - Mobile-first design

## Tech Stack

Next.js 14 • React • TypeScript • Tailwind CSS • Framer Motion • Shadcn UI

## Project Structure

```
app/
├── page.tsx           # Landing page
├── audit/page.tsx     # Main audit dashboard
└── book/page.tsx      # Calendly booking

components/
├── landing/           # Hero, features, pricing, etc.
├── audit/             # Upload zone, credit score card
└── ui/                # Shadcn components
```

---

**Designed for developers who appreciate good UX** 