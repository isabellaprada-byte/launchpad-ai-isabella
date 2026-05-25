# Skill: Clean Code Conventions

## File naming

- Pages: `app/<module>/page.tsx`
- API routes: `app/api/<module>/<action>/route.ts`
- Agents: `lib/agents/<name>-agent.ts`
- Components: `components/<name>.tsx` (PascalCase filename)
- One component per file

## TypeScript

- Define types for all API request/response shapes
- No `any` — use `unknown` and narrow it
- Export types from the file that defines them

## Functions

- Extract a helper only when it is used in 2+ places
- Keep API route handlers thin — business logic goes in agents or lib files
- No default exports except for Next.js pages and API routes

## Code hygiene

- No `console.log` in committed code
- No commented-out code
- No unused imports or variables
- No TODO comments — either do it or create a task

## Components

- All async data fetching happens in API routes, not in components
- Components receive data as props or fetch via `fetch()` from API routes
- Loading states: disable buttons and show a spinner during async actions
- Error states: surface a readable message — never show a blank screen or raw error object
