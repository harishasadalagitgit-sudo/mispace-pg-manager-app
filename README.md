# MiSpace PG Manager

A desktop app (Electron + React + TypeScript) for day-to-day income and
expense entry at MiSpace PG, built for Mac and Windows. It reads and writes
the **same Firebase Firestore database** used by the
[paying-guest-manager-2026](https://github.com/harishasadalagitgit-sudo/paying-guest-manager-2026)
website, so anything approved here shows up there immediately, and vice versa.

## Roles

Two roles, both password-only (no usernames), set per machine in Settings:

- **Supervisor** — enters income and expenses, which go into a pending queue
  for review. Can also view the Directory, Records, Reports, Bookings, and
  Checklist.
- **Admin** — everything a Supervisor can do, plus: approving/rejecting
  pending entries, editing residents/employees/rooms directly, managing
  bookings and enquiries, and Settings (passwords, backups).

## How data flows

1. A Supervisor (or Admin) submits an income or expense entry. It's written
   to a desktop-only staging collection (`deskIncomeEntries` /
   `deskExpenseEntries`) with `status: "pending"`.
2. An Admin reviews it on the **Approvals** screen. Approving copies a mapped
   record into the website's live `incomingPayments` / `expenses` collections
   and recalculates the resident's rent balance (or, for an advance/security
   deposit entry, adds to their `securityDeposit` instead — advances never
   affect the rent-balance calculation).
3. Rejecting just marks the desk entry `rejected` with an optional note; it
   never touches the live collections.

Rent balance is computed as `months elapsed since joining × rent amount −
total rent paid so far`, using the joining day-of-month as the monthly
billing anniversary (the first month is owed immediately on joining).

## Features

- **Dashboard** — this month's income/expense/net, occupancy, vacant beds
  (by sharing type), bookings not yet moved in, pending enquiries, and a
  month-end reminder (29th/30th) to review the Checklist.
- **New Income / New Expense** — entry forms that stage into the pending
  queue. Income entries can be flagged as an advance/security deposit instead
  of monthly rent.
- **Approvals** *(Admin only)* — review, approve, or reject pending entries.
- **Bookings** — track people who've paid an advance and reserved a room/bed
  but haven't moved in yet; Admin can convert a booking into a resident.
- **Directory** — read-only live lookup: Residents, Rooms (Admin can edit
  per-room capacity), Vacant rooms, Employees, Bookings, and visitor
  Enquiries (Admin can update enquiry status).
- **Records** — a unified, deduplicated view of desk + live income/expense
  records, filterable by status, search, and date (All / Month / Custom).
- **Reports** — Expense and Income reports with a category breakdown, a
  Month/Custom date-range toggle, and exports (Expenses CSV, Income CSV, or
  both together as one XLSX with two sheets).
- **Checklist** *(desktop only)* — a monthly recurring-expense reminder list
  (staff salaries, utility bills, groceries, gas, rent, etc.) so nothing gets
  forgotten. Includes a Verify button that best-effort cross-checks each item
  against that month's actual expense records.
- **Update Residents / Update Employees** *(Admin only)* — direct CRUD
  against the live website data: add/edit, move room, mark vacated (archived
  to `vacatedResidents`, restorable), or permanently delete.
- **Settings** *(Admin only)* — change Admin/Supervisor passwords, full
  database backup as a multi-sheet XLSX file.

## Tech

- Electron + React + TypeScript, scaffolded with [electron-vite](https://electron-vite.org)
- Firebase Firestore (client SDK) for all data
- `react-router-dom` (`HashRouter`) for in-app navigation
- `xlsx` (SheetJS) for backup/report exports

## Project structure

```
src/
  main/            Electron main process (window, IPC: file save dialogs)
  preload/         IPC bridge exposed to the renderer as window.api
  renderer/src/
    pages/         One file per screen (Dashboard, IncomeEntry, Approvals, ...)
    components/    Layout/sidebar, login, shared UI (toasts, prompt dialogs)
    lib/           Firebase client, types, auth, rent-calc, mapping, session
    hooks/         useCollection — live Firestore collection subscription
```

## Development

```sh
npm install
npm run dev         # launch with hot reload
npm run typecheck    # tsc, no emit
npm run build          # typecheck + production build
```

## Packaging

```sh
npm run build:mac    # -> dist/*.dmg
npm run build:win    # -> dist/*.exe (requires Windows or Wine)
```

## Firestore rules

This app shares Firestore rules with the website repo
(`paying-guest-manager-2026/firestore.rules`). Any new collection this app
introduces needs a matching rule added there and deployed with
`firebase deploy --only firestore:rules` before the app can read/write it —
current collections it depends on beyond the website's own
(`residents`, `rooms`, `employees`, `expenses`, `incomingPayments`,
`enquiries`, `bookings`): `deskIncomeEntries`, `deskExpenseEntries`,
`vacatedResidents`, `monthlyChecklists`.
