# Aura Fit (gym-ai)

> Cross-platform AI-assisted fitness and desk workout system for remote workers and sedentary lifestyles.

Aura Fit combines an equipment-free exercise catalog, caloric MET calculation, and LLM-assisted routine generation with an interactive mobile client and high-performance backend API.

---

## 🏗 Architecture & Stack

```
┌────────────────────────────────┐
│   React Native / Expo Client   │
│  (Expo Router 6, Zustand, UI)  │
└───────────────┬────────────────┘
                │ REST / WebSocket
                ▼
┌────────────────────────────────┐
│       NestJS Backend API       │
│  (Fastify 5, TypeScript 5.8)   │
└───────────────┬────────────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
┌───────────────┐ ┌───────────────┐
│ Supabase Auth │ │ LLM Workout   │
│   & Postgres  │ │   Engine      │
└───────────────┘ └───────────────┘
```

| Layer | Technology | Key Responsibilities |
|---|---|---|
| **Mobile Client** (`expo/app/`) | React Native 0.81, Expo ~54, Expo Router ~6, Zustand, i18next | Cross-platform mobile UX, local workout execution, timer, calorie tracking |
| **Data & Prompt Core** (`expo/`) | JSON Schema (Draft 2020-12), Curated Catalog (75+ exercises) | Source of truth for exercise constraints, MET values, few-shot prompt templates |
| **Backend API** (`nestjs/`) | NestJS 11, Fastify 5, TypeScript 5.8 | Auth integration, user state, LLM workflow orchestration |
| **Database & Auth** | Supabase (`@supabase/supabase-js` v2) | Secure authentication, profile storage, sync |
| **Containers** | Docker, Docker Compose | Hermetic backend runtime for local development and cloud deployment |

---

## 🌟 Key Features

- **Desk & Home Friendly:** 75 curated, equipment-free exercises (chair, wall, doorway, stairs) designed for remote workers.
- **Calorie & MET Accuracy:** Scientific energy expenditure calculation based on MET coefficients at both planning and execution time.
- **LLM-Powered Plan Synthesis:** Generates multi-week customized workout schedules based on personal health goals and constraints.
- **Interruption Resilience:** Flexible execution windows accommodating daily meetings and shifting schedules.

---

## 🚀 Quick Start

### 1. Backend (NestJS API)

```bash
cd nestjs
pnpm install

# Run in watch mode
pnpm start:dev

# Or run via Docker Compose
docker-compose up
```

### 2. Mobile App (Expo)

```bash
cd expo/app
pnpm install

# Start development server
pnpm start

# Run on iOS simulator or Android emulator
pnpm ios
pnpm android
```

---

## 🧪 Testing

```bash
# Mobile checks
cd expo/app
pnpm lint
pnpm typecheck

# Backend tests
cd nestjs
pnpm test
pnpm test:e2e
```
