# Resend setup runbook — `heymanuel.ch` (as-built)

**Plan:** [resend-email-migration](00-overview.md) · **Phase:** [01-resend-domain-verification](01-resend-domain-verification.md)
**Purpose:** as-built record of the one-time Resend account + `heymanuel.ch` domain
verification + sending API key, so `pollendar@heymanuel.ch` is an authenticated
production sender. The canonical *living* operator runbook is `docs/DEPLOY.md`
("Resend setup") written in Phase 3 — this file is the planning/as-built record.

> ⚠️ **No secrets in this file.** The Resend API key value is **never** written
> here (or anywhere in the repo). This doc records only *where* the key lives and
> how the production env maps to it. See [Secret storage](#secret-storage).

---

## Status

| Item | State | Notes |
|------|-------|-------|
| Resend account created + email confirmed | ☐ / ✅ | step 1 |
| `heymanuel.ch` added in Resend → Domains | ✅ | step 2 — fill region below |
| DNS records captured (table below) | ✅ | steps 3–4 — **paste actual values** |
| DNS records added at provider | ✅ | step 4 |
| Domain shows **Verified** in Resend | ☐ **PENDING** | step 5 — awaiting DNS propagation |
| `pollendar-prod-smtp` API key created (sending scope) | ☐ | step 6 |
| Key stored in `.env.prod` on prod host | ☐ | step 7 — see Secret storage |

**Resend region:** `________` (e.g. `us-east-1` / `eu-west-1`) — does **not**
change the SMTP host, which is always `smtp.resend.com`. Record it for the
return-path / `feedback-smtp.<region>.amazonses.com` MX value.

**Verified timestamp:** `________` (fill once all records read green in Resend).

---

## DNS records added to `heymanuel.ch`

> Paste the **exact** values Resend issued for *your* domain. The hosts/values
> below are the expected *shape* — Resend fills the real selector and key tokens.
> Do not hand-author DKIM/SPF values; copy them verbatim from the dashboard.

| # | Type | Host / Name | Value | TTL | Purpose |
|---|------|-------------|-------|-----|---------|
| 1 | `TXT` (or `CNAME`) | `resend._domainkey.heymanuel.ch` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCW0LlOwMP77UGTElOJx1m2mQq1Pqgs4dfkKPfvBMiC/eFKt4RdQ0A/0zMGmV1h6MSPxUDh8RqmulIRXjO8qVn1Fp9I4CHn2Eqh6QmZ55j3AUEGp338IP8zi3qUWHGLCDpOLeFIyDLBwgg0MBQ7IjkZ4wKbo7VMlSW8OYFIK/6o2QIDAQAB` | `Auto`/`3600` | **DKIM** — signs outbound mail |
| 2 | `MX` | `send.heymanuel.ch` | `feedback-smtp.eu-west-1.amazonses.com` (priority `10`) | `Auto`/`3600` | **Return-path / custom MAIL FROM** |
| 3 | `TXT` | `send.heymanuel.ch` | `v=spf1 include:amazonses.com ~all` | `Auto`/`3600` | **SPF** for the return-path subdomain |
| 4 | `TXT` | `_dmarc.heymanuel.ch` | `v=DMARC1; p=none;` | `Auto`/`3600` | **DMARC** — start permissive, tighten later |

**SPF merge note:** if the apex `heymanuel.ch` already had an SPF `TXT`, the
Resend include was **merged into the single existing record** (never a second SPF
`TXT` — multiple SPF records are invalid). Record what changed:
`________________________________________` (e.g. "apex had no prior SPF — added
on `send.` subdomain only, apex untouched").

### Spot-check commands (run after adding records)

```bash
dig TXT  resend._domainkey.heymanuel.ch +short   # DKIM key present
dig MX   send.heymanuel.ch              +short   # → feedback-smtp.<region>.amazonses.com
dig TXT  send.heymanuel.ch              +short   # → v=spf1 include:amazonses.com ~all
dig TXT  _dmarc.heymanuel.ch            +short   # → v=DMARC1; p=none;
```

---

## Dashboard steps (as performed)

1. **Account** — signed in at https://resend.com with the project owner's email;
   account email confirmed so the dashboard is unlocked.
2. **Add domain** — Domains → Add Domain → `heymanuel.ch` (apex). Region noted above.
3. **Capture records** — copied every DNS record Resend displayed into the table
   above *before* touching DNS.
4. **Add at DNS provider** — entered each record verbatim at the `heymanuel.ch`
   DNS provider; merged SPF if a prior record existed (see merge note).
5. **Verify** — clicked **Verify** in Resend; re-checking until every record is
   green. ⏳ *currently awaiting propagation (minutes–hours).*
6. **API key** — API Keys → Create API Key → name `pollendar-prod-smtp`, scope
   **Sending access** only, restricted to `heymanuel.ch` if offered. Copied the
   key **once** (shown only at creation) straight into `.env.prod` (below).
7. **Store key** — written into the prod-host `.env.prod` as `SMTP_PASSWORD`
   (see Secret storage). **Not** committed, not in the image.

---

## Secret storage

**Decision:** the Resend API key + production env live in a **`.env.prod` file on
the production host only** — *not* in the repo and *not* in the Docker image.

This is safe in this project because both leak vectors are already closed:
- `.gitignore` ignores `.env.*` (except `.env.example`) → can't be committed.
- `backend/.dockerignore` ignores `.env` / `.env.*` → can't enter the image.

Operational rules for the file:
- Lives only on the prod host, e.g. `/opt/pollendar/.env.prod`.
- `chmod 600`, owned by the deploy user.
- Applied at runtime via `docker run --env-file /opt/pollendar/.env.prod …`
  (or an `env_file:` entry in a production compose file).
- **Never** `git add -f`'d, never copied into the build context, never logged.

### Production SMTP mapping (values go in `.env.prod`, **not** here)

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465                 # or 587 if the host blocks 465 (then SMTP_SECURE=false / STARTTLS)
SMTP_SECURE=true              # true on 465, false on 587
SMTP_USER=resend              # literal string "resend" — required by Resend SMTP
SMTP_PASSWORD=<the pollendar-prod-smtp Resend API key>   # ← secret, host-only
MAIL_FROM="Pollendar <pollendar@heymanuel.ch>"
```

> The same `.env.prod` also holds the other production secrets from
> `docs/DEPLOY.md` ("Required production environment"): `JWT_ACCESS_SECRET`,
> `JWT_REFRESH_SECRET`, `DATABASE_URL`, etc.

---

## Consumed by later phases

These are the production values the next phases reference — **this phase changes
no code, no `.env*`, no `docker-compose.yml`, no `backend/src/mail/*`, and no
`backend/src/config/env.validation.ts`:**

- **Phase 2** (`02-backend-smtp-config`) — production-scoped env validation in
  `backend/src/config/env.validation.ts` (require non-empty `SMTP_USER`/
  `SMTP_PASSWORD` + `SMTP_SECURE=true` outside development) + a commented Resend
  block in `.env.example` + a Resend transport case in `mail.service.spec.ts`.
  Uses the mapping above (`smtp.resend.com`, port `465`, secure, `user=resend`).
- **Phase 3** (`03-deploy-wiring-and-docs`) — `docs/DEPLOY.md` "Resend setup"
  (canonical living runbook), README/compose docs for the prod=Resend /
  dev+e2e=Mailpit split, and the real end-to-end send verification (a live
  magic-link from `pollendar@heymanuel.ch` reading **Delivered** in Resend).

**Gate for Phase 3's real send:** the [Status](#status) table's "Verified" row
must read ✅ before the live-send check — DNS propagation gates it. Phase 2's
code/config can be written and unit-tested *without* waiting on DNS.
