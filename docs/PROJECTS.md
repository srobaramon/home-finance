# Projects — analysis & plan

Use cases: building a house, renovating an apartment, building a garden or pool, buying a car,
company investments (new workshop, equipment). Each has a **build phase** (planned budget split
into parts, quotes/contracts, payments over months) and often an **ownership phase** (the result
becomes an asset that costs money over the years and has a value).

## What the app already had
| Need | Existing feature | Gap |
|---|---|---|
| Total budget + spent | Goal of kind *trip/event* with tagged expenses | No split into phases, no plan vs actual per part |
| Planned parts (foundations, roof…) | — | Missing |
| Quotes / contracts (committed money) | — | Missing |
| Forecast "where will we end up" | — | Missing |
| Result becomes an asset (house, car, pool) | Assets with value, history, depreciation | No link from spending to the asset |
| Costs over the years (insurance, service, maintenance) | Recurring payments, categories | Can't see total cost of ownership per thing |
| Financing (mortgage, savings) | Debts linked to assets, savings goals | Fine for now (link debt to the project's asset) |

## What is added
**Project** (`kind: project`) — name, icon, type (house, renovation, garden, pool, car, other),
status (planning / in progress / finished), total budget, contingency %, start / target end date,
finished date, linked asset, note.

**Budget line** (`kind: projectLine`) — a part of the project: name, planned amount, contracted
amount (quote/contract), supplier, due date, status (planned / contracted / done), order.

**Transactions** get optional `projectId` and `projectLineId`.

### Rules
- *Spent* = expenses tagged to the project (up to the finished date = build cost; after it = running costs).
- Per line: *expected* = actual spent if the line is done, otherwise max(spent, contracted or planned).
- *Forecast at completion* = sum of expected per line + spent not assigned to a line.
- *Over budget* = forecast − budget (contingency shown separately).
- **Ownership** (after finishing / for a car from day one): total invested = build cost + running
  costs; with a linked asset: current value, value − invested, cost per month of ownership.
- "Finish project → add to assets" creates (or updates) the asset with value = build cost
  (vehicles get 15 %/yr depreciation by default) and links it.

### Templates (split the total budget by typical shares)
- House: land & permits 8, design 5, foundations 10, walls 15, roof 9, windows & doors 7,
  installations 12, interior 13, kitchen & bathrooms 8, exterior & landscaping 5, utilities 3, contingency rest
- Renovation: demolition, electrical, plumbing, walls & floors, kitchen, bathroom, painting, furniture
- Garden: design, earthworks, paving & terraces, planting, irrigation, fencing, lighting
- Pool: permits, excavation, pool shell, filtration & technology, heating, surroundings, cover
- Car: purchase price, registration & taxes, insurance (first year), tyres & accessories

### Screens (web + iOS)
Plans → **Projects** (first segment) · Overview card for active projects · Project detail
(budget / spent / contracted / forecast, time progress, lines with plan vs actual, spending by
category, transactions, ownership block) · forms for project and line · project + line pickers
in the transaction form.

## Later (needs your input / accounts)
- Bank sync (Enable Banking) → auto-tag transactions to projects by rules
- Invoice/receipt OCR with an LLM → attach documents to budget lines
- Payment schedule & reminders per line, photos/documents per project, sharing with a partner/builder
