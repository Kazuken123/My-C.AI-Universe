# Project: "My C.AI Universe" Next.js Frontend Migration

## Architecture
- **Framework**: Next.js 14.2+ App Router (`nextjs-frontend/`) with TypeScript (`strict: true`).
- **Styling**: Tailwind CSS with Vanguard & Higgsfield dark theme design tokens (`#07070b` canvas, `#0e0d16` core, `#8b5cf6` accent, double-bezel concentric chassis).
- **Icons**: `lucide-react`.
- **API Proxy**: Next.js `rewrites()` in `next.config.mjs` mapping `/api/*` and `/assets/avatars/*` to Express backend on `http://127.0.0.1:3000`, solving CORS while natively supporting SSE chunked streaming.
- **Port Allocation**: Express backend on `3000`; Next.js client dev server on `3001` (`npm run dev -- -p 3001`).
- **Authentication**: JWT token persisted in `localStorage.cai_auth_token` and synchronized cookie `cai_auth_token`. Global React `AuthContext` provides user state and hydration via `GET /api/auth/me`.
- **Testing Architecture**: Vitest for component/unit tests; Playwright for opaque-box E2E user flows.

## Code Layout
```
nextjs-frontend/
├── app/
│   ├── layout.tsx                   # Vanguard dark root layout, AuthProvider, Toaster
│   ├── page.tsx                     # Character discovery catalog (Home)
│   ├── globals.css                  # Vanguard/Higgsfield design tokens & double-bezel styling
│   ├── auth/
│   │   └── page.tsx                 # Tabbed Login & Register page
│   ├── reset-password/
│   │   └── page.tsx                 # 3-step 6-digit OTP reset flow (wrapped in Suspense)
│   ├── profile/
│   │   └── page.tsx                 # Profile details, avatar uploader & persona selector
│   ├── personas/
│   │   └── page.tsx                 # Roleplay identities roster & persona creator
│   ├── create/
│   │   └── page.tsx                 # Character studio (Wiki parser, AI concept synthesizer, form)
│   ├── chat/[id]/
│   │   └── page.tsx                 # Interactive chatroom (SSE streaming, demeanor bar, swiper)
│   └── chats/
│       └── page.tsx                 # Saved conversation history threads
├── components/
│   ├── ui/                          # Atoms: Button, Input, Modal, Badge, Toast, Dropdown, Textarea, DoubleBezel
│   ├── layout/                      # Navbar, Sidebar, MobileNav, AmbientCanvas
│   ├── auth/                        # LoginForm, RegisterForm, ResetPasswordFlow
│   ├── characters/                  # CharacterCard, CharacterGrid, FilterBar, CharacterSearch
│   ├── chat/                        # ChatBox, MessageList, MessageItem, ChatHeader, ChatInput, VariantSwiper, DemeanorBar, RelationshipDirector, MemoryDrawer
│   └── studio/                      # CharacterForm, WikiParser, ConceptGenerator, AvatarUploader
├── lib/
│   ├── api.ts                       # Strongly-typed API client wrapper (fetch + JWT headers)
│   ├── auth.ts                      # Token storage (localStorage + cookie sync)
│   ├── sse.ts                       # Server-Sent Events stream consumer
│   └── utils.ts                     # cn() utility (clsx + tailwind-merge)
├── types/
│   ├── api.ts                       # ApiResponse, ApiError
│   ├── auth.ts                      # User, AuthResponse, PasswordResetPayload
│   ├── character.ts                 # Character, CharacterCategory, CharacterCreatePayload
│   ├── chat.ts                      # ChatSession, ChatMessage, MessageVariant, RelationshipMetrics
│   └── persona.ts                   # UserPersona, PersonaCreatePayload
├── context/
│   └── auth-context.tsx             # Global Auth React Context & Provider
├── tests/
│   ├── unit/                        # Unit and component tests
│   └── e2e/                         # Playwright E2E test specs
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

## Feature Inventory
Every feature discovered across user requirements and codebase survey is cataloged and assigned to a specific milestone.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Next.js App Router Scaffolding | Modern Next.js TypeScript setup with Tailwind and App Router | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Vanguard Dark Design Tokens | Dark theme color tokens, double-bezel concentric chassis, cursor spotlight | M1 | Survey 2 & 3 |
| 3 | API Proxy & CORS Configuration | Next.js rewrites proxying `/api/*` and `/assets/avatars/*` to Express | M1 | Survey 3 |
| 4 | Typed API Client & Token Storage | Strongly-typed fetch client with JWT in localStorage & cookie | M1 | Survey 1, 2, 3 |
| 5 | Global Auth Context & Layout | AuthProvider, current user hydration (`GET /api/auth/me`), responsive navigation | M1 | Survey 2 & 3 |
| 6 | User Registration | Registration with username, password, display name, avatar, scrypt hash | M2 | ORIGINAL_REQUEST §R2 |
| 7 | User Sign-In | Login with username/password, JWT issuance, timing-safe error handling | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Password Reset: OTP Request | Request 6-digit verification code via email (`POST /api/auth/forgot-password`) | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Password Reset: Code Verification & Update | Enter 6-digit code and submit new password (`POST /api/auth/reset-password`) | M2 | ORIGINAL_REQUEST §R2 |
| 10 | Password Reset: Deep Link Support | Prepopulate email and code via URL query params (`?email=...&code=...`) in Suspense | M2 | Survey 2 |
| 11 | User Profile Management | View user profile, update username and display name (`PUT /api/auth/profile`) | M2 | ORIGINAL_REQUEST §R2 |
| 12 | Avatar Upload & Storage | Upload base64 avatar images, persist via `/api/auth/upload-avatar` | M2 | ORIGINAL_REQUEST §R2 |
| 13 | Roleplay Persona Roster | List, create, update, and delete custom user personas (`/api/personas`) | M2 | ORIGINAL_REQUEST §R2 |
| 14 | Default Persona Assignment | Select active default persona for chat prompt injection | M2 | ORIGINAL_REQUEST §R2 |
| 15 | Character Discovery Catalog | Directory page with search, sort (popular, likes, newest), and category pills | M3 | ORIGINAL_REQUEST §R3 |
| 16 | Asymmetric Bento Character Grid | 12-column responsive bento cards with avatars, badges, and metrics | M3 | Survey 2 |
| 17 | Character Like Interaction | Real-time like counter toggle (`POST /api/character/:id/like`) | M3 | Survey 1 & 2 |
| 18 | Character Studio Editor | 15-field character creation and edit interface (`POST/PUT /api/character`) | M3 | ORIGINAL_REQUEST §R3 |
| 19 | Wiki Lore Auto-Extraction | Fandom/Wikipedia scraper for character lore (`POST /api/character/parse-wiki`) | M3 | Survey 1 & 2 |
| 20 | AI Character Concept Synthesizer | Generate full character profile from short prompt (`POST /api/character/generate`) | M3 | Survey 1 & 2 |
| 21 | Sticky Live Dossier Preview | Real-time preview card updating on keystroke during character creation | M3 | Survey 2 |
| 22 | Narrative Chat Session Management | Create, load, and delete chat sessions seeded with character greeting | M4 | ORIGINAL_REQUEST §R4 |
| 23 | Real-Time SSE Token Streaming | Stream AI response tokens via `POST /api/chat?stream=true` with live cursor | M4 | ORIGINAL_REQUEST §R4 |
| 24 | Demeanor Bar & Relationship Dynamics | Affinity (-100..100), trust, strain, 11 stages, mood pill | M4 | ORIGINAL_REQUEST §R4 |
| 25 | Relationship Director Popover | Manual adjustment of bond, mood, and strain repair | M4 | Survey 1 & 2 |
| 26 | Takes Variant Swiper | Swipe between multiple alternative response takes (`Take 1/X`), reshoot button | M4 | Survey 1 & 2 |
| 27 | Message Interaction Tools | Pin turn to context, inline edit message, rewind conversation to turn, TTS speak | M4 | Survey 1 & 2 |
| 28 | Autonomous Scene Continuation | "Continue" button prompting character to advance narrative autonomously | M4 | Survey 1 & 2 |
| 29 | Memory Notebook & Dossier Drawer | View character lore, pinned turns, and long-term memories (`/api/memories`) | M4 | ORIGINAL_REQUEST §R4 |
| 30 | Saved Storyline Threads Page | Browse and resume saved sessions from database (`/chats`) | M4 | Survey 2 |
| 31 | Full E2E Test Suite Execution | Pass 100% of opaque-box E2E tests (Tiers 1-4) across all features | M5 | Acceptance Criteria |
| 32 | Adversarial Hardening (Tier 5) | White-box adversarial testing, edge-case hardening, and zero-defect audit | M5 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation & Core UI Chassis | Next.js App Router, Tailwind tokens, API proxy, base layout, typed API client & Auth Context | none | DONE |
| M2 | Authentication & Account Management | Login, Register, 3-Step Password Reset (6-digit OTP), Profile & Persona Management, Avatar Upload | M1 | DONE |
| M3 | Character Discovery & Studio | Catalog bento grid, search, category filters, like toggle, Character Studio, Wiki extractor, AI synthesizer | M1 | PLANNED |
| M4 | Real-Time Chat & Demeanor Engine | Chatroom, SSE streaming, Demeanor indicators, Relationship Director, Takes swiper, Memory drawer, Threads | M1, M2, M3 | PLANNED |
| M5 | E2E Verification & Adversarial Hardening | Phase 1: 100% pass rate on E2E test suite (Tiers 1-4); Phase 2: Tier 5 adversarial testing & audit | M1, M2, M3, M4 | PLANNED |

## Interface Contracts

### Client ↔ Express Backend Proxy (`next.config.mjs`)
- `/api/:path*` -> `http://127.0.0.1:3000/api/:path*`
- `/assets/avatars/:path*` -> `http://127.0.0.1:3000/assets/avatars/:path*`
- Headers preserved: `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept: text/event-stream`

### Auth Module (`lib/auth.ts`, `context/auth-context.tsx`)
```typescript
export interface User {
  id: string;
  username: string;
  email?: string;
  displayName: string;
  avatar: string;
  role: 'user' | 'admin';
  createdAt: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}
```

### Character Module (`types/character.ts`)
```typescript
export interface Character {
  id: string;
  name: string;
  tagline: string;
  avatar: string;
  greeting: string;
  personality: string;
  appearance?: string;
  abilities?: string;
  background?: string;
  speaking_style?: string;
  example_dialogues?: string;
  initial_memory?: string;
  initialAffinity?: number;
  initialRelationshipStage?: string;
  relationshipDynamic?: string;
  categories: string[];
  creator: string;
  ownerUserId?: string | null;
  interactions: number;
  likes: number;
  isLiked?: boolean;
}
```

### Chat & Streaming Module (`types/chat.ts`, `lib/sse.ts`)
```typescript
export interface MessageVariant {
  id: string;
  text: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  selectedVariantIndex: number;
  variants: MessageVariant[];
  isPinned: boolean;
  rating: number;
  createdAt: string;
}

export interface RelationshipMetrics {
  affinity: number;
  trust: number;
  strain: number;
  relationshipStage: string;
  relationshipMood: string;
}

export interface ChatSession {
  id: string;
  characterId: string;
  characterName: string;
  characterAvatar: string;
  characterTagline: string;
  personaId?: string;
  title: string;
  provider: string;
  relationship: RelationshipMetrics;
  messages: ChatMessage[];
}

export interface ChatStreamTokenChunk {
  token: string;
}

export interface ChatStreamDoneChunk {
  done: true;
  sessionId: string;
  userMessage: ChatMessage;
  aiMessage: ChatMessage;
  response: string;
  relationship: RelationshipMetrics;
}
```
