# End-to-end tests

Drives the real backend and a production build of the frontend in Chromium. Two new
users sign up through the OTP screens, plan a trip together and share live location.

```bash
cd e2e
npm install
npx playwright install chromium   # first time only
npm test
```

What a run does:

- Resets a separate `tabi_e2e` database from the Prisma migrations. Your dev database
  is never touched, and the config refuses to reset anything not named `tabi_e2e`.
- Starts the backend on port 3101 and the frontend on 3100, so a dev stack on
  3000/3001 can keep running. Both are stopped when the run ends.
- Reads OTPs from the backend log in `.output/`, since dev doesn't send SMS.

Needs Postgres running (`docker compose up -d` in `backend/`), a filled-in
`backend/.env`, and network access: road routing calls the public OSRM server.
`npm run report` opens the HTML report, with a trace for any failed run.
