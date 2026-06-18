# Phase 1: Resend account + heymanuel.ch domain verification runbook

**Plan:** [resend-email-migration](00-overview.md)
**Depends on:** none
**Execution:** solo

## Context
Pollendar's `MailService` (`backend/src/mail/mail.service.ts`) sends outbound mail through nodemailer over SMTP, configured purely from the validated `SMTP_*` / `MAIL_FROM` env vars. The feature goal is to migrate **production** outbound email from the local Mailpit sink to Resend SMTP, sending from `Pollendar <pollendar@heymanuel.ch>`, while keeping Mailpit for local dev + the e2e suites. Before any code/env/docs change is meaningful, the `heymanuel.ch` domain must be DNS-authenticated (SPF/DKIM/DMARC + return-path) inside Resend and a sending API key must exist — otherwise Resend rejects or silently spam-folders mail from that sender. This phase is a **manual runbook + captured-records doc**; it touches no code and no existing env.

## Objective
Create the Resend account, verify the `heymanuel.ch` sending domain via the DNS records Resend issues, generate a sending API key, and capture the exact records + dashboard steps in a runbook doc so `pollendar@heymanuel.ch` is an authenticated, verified production sender.

## Files to touch
- `docs/plans/2026-06-18-resend-email-migration/RESEND-RUNBOOK.md` — **new** doc capturing the Resend dashboard steps, the exact DNS records added to `heymanuel.ch` (record type / host / value / TTL, with the Resend-provided selector/value placeholders filled in once known), the verification status, and where the generated API key is stored (a secret-manager reference — **never** the key value itself). This is the only file this phase creates. No existing code or env files are edited.

## Steps
1. Create / sign in to a Resend account at `https://resend.com` using the project owner's email. Confirm the account email so the dashboard is fully unlocked.
2. In the Resend dashboard, open **Domains → Add Domain** and enter `heymanuel.ch` (the apex domain the owner controls). Choose the region closest to the production deploy if prompted, and note it in the runbook (it does not affect SMTP host, which stays `smtp.resend.com`).
3. Resend now displays a set of DNS records to add at the `heymanuel.ch` DNS provider. Copy each one verbatim into the runbook's records table **before** touching DNS. Expect these record families (Resend fills the exact host/value tokens):
   - **DKIM** — `TXT` (or `CNAME` for the hosted-key option) at a Resend selector host such as `resend._domainkey.heymanuel.ch`, value = the Resend-provided public key / target.
   - **SPF / Return-Path (custom MAIL FROM)** — typically a `MX` record and a `TXT` SPF record on a `send.heymanuel.ch` (or Resend-named) subdomain, e.g. `MX send.heymanuel.ch → feedback-smtp.<region>.amazonses.com` (priority `10`) and `TXT send.heymanuel.ch → "v=spf1 include:amazonses.com ~all"`. Use the exact host/value Resend shows — do not hand-author these.
   - **DMARC** (recommended) — `TXT` at `_dmarc.heymanuel.ch`, value `v=DMARC1; p=none;` (start permissive; tighten to `quarantine`/`reject` later once delivery is confirmed).
4. Add each record at the `heymanuel.ch` DNS provider exactly as captured. If the apex already has an SPF `TXT`, **merge** the Resend include into the single existing SPF record rather than adding a second SPF `TXT` (multiple SPF records are invalid). Record any merge in the runbook.
5. Back in the Resend dashboard, click **Verify** on the `heymanuel.ch` domain. Re-check periodically until every record shows **Verified** (DNS propagation can take minutes to a few hours). Capture the final verified status and timestamp in the runbook.
6. Create the sending credential: **API Keys → Create API Key**, name it e.g. `pollendar-prod-smtp`, scope **Sending access** only, and (if Resend supports per-domain restriction) restrict it to `heymanuel.ch`. Copy the key **once** — it is shown only at creation.
7. Store the API key in the production secret manager (the same place that already holds `JWT_*` and `DATABASE_URL` per `docs/DEPLOY.md` "Secrets"). In the runbook record **only** the secret reference/handle and the mapping note: production `SMTP_PASSWORD` = this Resend API key, `SMTP_USER` = the literal string `resend`, `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465` with `SMTP_SECURE=true` (or `587` with `SMTP_SECURE=false` for STARTTLS), `MAIL_FROM="Pollendar <pollendar@heymanuel.ch>"`. **Do not** write the key value into any file in the repo.
8. In the runbook, add a short "consumed by later phases" note: these are the production values Phase 2 (env validation) and the deploy/docs phase will reference; this phase changes no `.env`, no `backend/src/mail/*`, and no `backend/src/config/env.validation.ts`.

## Verification
- `git status` shows only the new untracked file `docs/plans/2026-06-18-resend-email-migration/RESEND-RUNBOOK.md` — no code, env, or existing-doc changes (this is a planning/runbook phase).
- `git diff --stat` reports zero changes to `backend/`, `.env.example`, `docker-compose.yml`, and `docs/DEPLOY.md` (their migration edits belong to later phases).
- Manual: the Resend dashboard shows `heymanuel.ch` as **Verified** (all DKIM/SPF/return-path records green), and the runbook's records table matches the live DNS records (spot-check one DKIM and one SPF/MX host with `dig TXT resend._domainkey.heymanuel.ch +short` / `dig MX send.heymanuel.ch +short`).
- Manual: a `pollendar-prod-smtp` API key exists in Resend with sending-only scope, and its value lives in the secret manager (the runbook references it but never contains it).

## Acceptance
- [ ] `heymanuel.ch` shows **Verified** in Resend with DKIM, SPF/return-path, and DMARC records live in DNS.
- [ ] A sending-scoped Resend API key (`pollendar-prod-smtp`) exists and is stored in the production secret manager, not in the repo.
- [ ] `docs/plans/2026-06-18-resend-email-migration/RESEND-RUNBOOK.md` exists, captures every DNS record (type/host/value/TTL) and the dashboard steps, and contains **no** secret values.
- [ ] No code, `.env*`, `docker-compose.yml`, or existing-doc files are modified by this phase (`git status` confirms only the runbook is added).
