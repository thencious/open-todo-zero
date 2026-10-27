# Optional private backend

The default `npm start` command serves a static, browser-storage app. The Worker adds task backups, AI request diagnostics, and server-managed ntfy reminders. It does not provide cross-device editing or account creation.

## Hosting contract

This backend expects an **owner-private OpenAI Sites deployment**. Sites must authenticate requests before they reach the Worker and inject `oai-authenticated-user-id` for signed-in visitors. The reminder runner relies on that private access boundary for service requests.

**Do not expose these API routes on a public Worker without adding authentication and authorization.** Public source code does not require making the running app public.

## Setup

1. Create your own owner-private Site. Copy `.openai/hosting.example.json` to `.openai/hosting.json` and let your Sites tooling populate its real `project_id`. Never reuse someone else's Site identity.
2. Keep the D1 binding named `DB`. Apply `drizzle/0000_server_tasks.sql` using the host's migration mechanism.
3. Run `npm run build`. This embeds browser assets in `dist/server/index.js` and enables server integration in the generated HTML. Deploy the Worker, hosting manifest, and migrations through Sites.
4. Configure your own ntfy topic in the deployed app and wait for **Saved on device and server**. Server reminders support `https://ntfy.sh/<topic>`; private-topic credentials require an additional server-secret integration.
5. Schedule an authenticated **POST `/api/reminders/run` every hour**. For Sites service access, obtain the current Site service token through its admin tools and use `OAI-Sites-Authorization: Bearer <token>`. Never commit tokens or put them in the browser bundle.

New or changed tasks queue reminders immediately. The hourly sweep queues farther deadlines when they enter a 70-hour window; ntfy delivers at the scheduled time. Edits, completion, and deletion update or cancel queued reminders.

## Data and operations

| Route | Purpose |
| --- | --- |
| `POST /api/tasks/backup` | Save the browser's task snapshot and refresh reminders; requires visitor identity. |
| `POST /api/reminders/run` | Queue reminders and record the result; requires private service access. |
| `GET /api/server-status` | Inspect task count, reminders, and recent sweeps through private access. |

D1 tables: `tasks`, `reminder_jobs`, `server_runs`. Snapshots contain notes and model response evidence. OpenRouter credentials are not uploaded. Browser working copies remain local; this is backup and diagnosis, not automatic device synchronization.

The public repository contains no production Site ID, credentials, personal task records, default notification topic, or preconfigured scheduler. Generated hosting files and Worker bundles are ignored by Git.
