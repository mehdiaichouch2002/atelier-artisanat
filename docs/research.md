# Research notes

Short, focused research done before and during the build. Each point is marked as
**verified** (checked against a source), **assumption** (a reasonable business choice made for the app) or
**to confirm** (needs a Moroccan accountant, lawyer or the official text). Nothing in this application is legal
or accounting advice, and the app makes no compliance claims.

## 1. Moroccan regulatory context

| Topic | Status | Notes |
|---|---|---|
| Labour Code = Law n° 65-99 (dahir n° 1-03-194 of 11 September 2003) | verified (secondary source: [Africarrières](https://africarrieres.com/maroc/fr/guide/droit-du-travail/code-du-travail)) | Applies to most sectors; agriculture only partly. |
| Pay frequency: "ouvriers" at least twice a month at most 16 days apart; "employés" at least monthly | verified (reproduction of art. 363 on [fiscamaroc.com](https://www.fiscamaroc.com/fr/travail/conditions-de-travail-et-la-remuneration-du-salarie-788/le-paiement-des-salaires-842.htm)) | The weekly settlement model is compatible with this (weekly ≤ 16 days). **To confirm** against the Bulletin officiel before relying on it. |
| Piece-rate / output-based pay is a recognised form of pay | verified (same source, art. 364) | The app supports piece-rate arrangements. |
| Rules limiting how fast cash advances may be deducted from wages | **to confirm** | A Moroccan article ([aujourdhui.ma](https://aujourdhui.ma/?p=116048)) distinguishes an *advance* (may be recovered at the next pay) from a *loan* (instalments ≤ 1/10 of pay); the exact article could not be confirmed. The app therefore never deducts automatically beyond what the owner records, and lets advances be allocated to any week or carried forward. |
| Pay slips (bulletin de paie), payroll book, CNSS declarations, income tax (IR) | **to confirm** | Out of scope. Receipts printed by the app state explicitly that they are internal documents and **not** pay slips or invoices. |
| Registre National de l'Artisanat (RNA), Law 50.17 art. 4 & 6 | verified ([MTAESS / RNA page](https://mtaess.gov.ma/fr/registre-national-de-lartisanat/)) | Registers artisans, master artisans, cooperatives and craft enterprises; gives a *Numéro d'Identité de l'Artisanat*; linked to mandatory basic health insurance (AMO) for artisans. Registration is done on the official e-service ([eservice.artisanat.gov.ma](https://eservice.artisanat.gov.ma/fo_artisanat/)). The app does not store national ID numbers. |
| Personal data protection (Law 09-08, CNDP) | **to confirm** | The app minimises personal data (no national ID, phone/email optional). A declaration to the CNDP may be required depending on use; ask a professional. |
| Bookkeeping obligations of the business | **to confirm** | The ledger is an operational cash book, not certified accounting software. An accountant should keep the official books. |

## 2. Workshop workflows (business assumptions)

- **Crafts**: babouches (leather slippers: cutting, stitching, soles, finishing) and copperwork / dinanderie
  (sheet copper, hammering, chasing, polishing). Other products can be added as categories in Settings.
- **Pay arrangements** vary by worker: fixed weekly amount, daily rate × days worked, piece rate × pieces made,
  or an amount negotiated each week. The app models all four explicitly (assumption, based on common practice).
- **Msrouf**: small cash advances given during the week (daily needs, food/transport), usually deducted at the
  end-of-week settlement (often Saturday). Money handed to a worker to buy materials for the workshop is a
  *workshop expense*, not a wage advance — the app keeps the two apart (`advance_treatment`).
- **Week**: default Monday → Sunday, configurable start day (Settings). Each advance and payment belongs to
  exactly one pay week.
- **Orders**: price negotiated per order, deposit (*3arboun*) at confirmation, balance at delivery; status
  changes follow production. A deposit never means "paid".
- **Cash**: one or more cash boxes plus a bank account; bank deposits are transfers, not income.

## 3. Technical choices (verified against official documentation shipped with the packages)

- **Next.js 16.4** (App Router, Server Actions, `proxy.ts` replaces middleware in v16), **React 19.3**,
  TypeScript 5.9 strict, Tailwind CSS 4, Zod 4, Vitest 5, Playwright 1.64. TypeScript 7 (native) was available
  but not used: Next.js tooling still expects the TypeScript 5 JavaScript API.
- **PostgreSQL 16** with Row Level Security. Supabase is a managed PostgreSQL: the same migrations run there.
  Supabase Auth was not used because it cannot run locally without Docker in this environment; authentication is
  implemented with Node's `scrypt` and database-backed sessions (see `docs/security.md`).
- **UX for simple mobile business apps**: large touch targets (≥ 44 px), a bottom navigation bar with a central
  quick-action button, one-screen forms with pre-filled defaults, cards instead of wide tables on phones, numbers
  always with Latin digits and the "DH" suffix, plain-language labels.

## 4. Open questions for the owner / a professional

1. Should advances ever be recovered over several weeks (instalments)? Today: carry the balance forward manually.
2. Which documents must be given to workers each week (receipt vs. pay slip)?
3. Should the workshop record CNSS/AMO contributions in the app (currently not modelled)?
4. Is a CNDP declaration needed for storing customer phone numbers?
