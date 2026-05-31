# Aurex Frontend Client

A responsive, high-performance, dark-themed Next.js client for the Aurex AI cost-optimization dashboard. Built with the App Router, Framer Motion, and Tailwind CSS.

---

## 🏗️ Project Structure

```
frontend/
├── app/
│   ├── layout.tsx         # Root layout with font/meta providers
│   ├── page.tsx           # Product landing page (hero, pricing, footer)
│   ├── book/              # Calendly booking demo route
│   ├── terms/             # Terms of service
│   ├── privacy/           # Privacy policy
│   ├── docs/              # Interactive dual-SDK documentation (Python & Node.js)
│   ├── audit/             # Upload ledger / drag & drop audit simulator
│   └── app/               # Logged-in application space (requires session)
│       ├── page.tsx          # Real-time FinOps dashboard (Token Credit Score, loops)
│       ├── api-keys/         # Project client API keys manager
│       ├── profile/          # User profile settings
│       └── settings/         # Alert configurations and cost overrides
├── components/
│   ├── landing/           # Landing page specific components (AuthModal, pricing cards)
│   ├── audit/             # Audit simulation visualizers (UploadZone, CreditScoreCard)
│   ├── app/               # Logged-in dashboard layout, sidebar, user-dropdown
│   └── ui/                # Base design system components (buttons, dialogues, tables)
├── lib/
│   └── api-client.ts      # Fetch client wrapper with auto JWT tokens
├── public/
│   └── llms.txt           # Agent-friendly plain text reference documentation
├── tailwind.config.ts     # Design tokens and custom theme definitions
└── package.json           # Frontend packages and scripts
```

---

## ⚡ Development Setup

### 1. Install Node.js Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the `frontend/` directory:

```bash
# Backend REST API endpoint
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1

# Google SSO OAuth client ID
NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=858789082997-klmkuhibhkbsvt32m09is8pr2unof4iv.apps.googleusercontent.com

# Github OAuth client ID
NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID=Ov23li0QKEKEKAwIzAwY

# Contact form target ID
NEXT_PUBLIC_FORMSPREE_ID=mnjwznyb
```

### 3. Start Next.js Dev Server

```bash
npm run dev
```
- Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🎛️ Environment Variables Reference

| Variable | Type | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `string` | The API root URL of your Aurex backend (default: `http://localhost:8000/api/v1`). |
| `NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID`| `string` | Google OAuth Client ID for SSO on login/signup pages. |
| `NEXT_PUBLIC_GITHUB_OAUTH_CLIENT_ID`| `string` | GitHub OAuth Client ID. |
| `NEXT_PUBLIC_FORMSPREE_ID` | `string` | Formspree form ID for contact/booking forms. |

---

## 🎨 Design System & Aesthetics

Aurex uses a premium dark-mode aesthetic with custom animations:
- **Tailwind Config**: Uses oklch color space for smooth gradients.
- **Framer Motion**: Delivers subtle micro-interactions on button hover, card layout shifts, and sidebar expansions.
- **Typography**: Uses modern sans-serif fonts (e.g. Outfit / Inter) for high scannability and clean layout structures.
- **Chart Visualizations**: Rendered using standard charts or custom styled tables to prevent overwhelming text blocks.