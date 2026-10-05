# ACE Quiz Arena

This is a working browser MVP of ACE Quiz Arena.

## Included
- Secondary and Tertiary sections
- Tertiary: 100/200/300-level-compatible categories
- ACE Academy franchise branding with logo and tagline
- UTME year-aware question upload and year/subject selection
- Secondary: UTME/WASSCE-compatible categories
- Practice mode with random questions and user-selected question count, without a time limit
- Exam mode with a mandatory countdown
- Standard UTME mode: English fixed at 60 questions plus 3 user-selected subjects fixed at 40 questions each, with all topics included and a result scaled to /400
- Standard Quiz Challenge examples
- Sign up/sign in flow
- Admin question-bank interface with full question editing
- Add/edit/delete questions
- Responsive design

## Deploy on Vercel
This version is prepared for Vercel Functions and Neon Postgres so accounts, questions and challenges can be shared between devices.

1. In your Vercel project, connect a **Neon Postgres** database from the Vercel Marketplace.
2. Add `DATABASE_URL` to the Vercel project environment variables (the Neon integration can provide it).
3. Add `ADMIN_PASSWORD` with the administrator password you want to use.
4. Redeploy the project.
5. Open the site and create/sign in to an account. The same account can then be used on another device.
6. Sign in to the Admin area and upload questions. They are saved to the shared database instead of only to the phone's browser.

The API creates its required database tables automatically on first use. User authentication uses secure, HttpOnly server-side session cookies; passwords are stored as salted scrypt hashes, and login state is not stored in localStorage. Vercel's current recommended marketplace database option for Postgres is Neon. See Vercel's Neon integration documentation for the connection setup. 

## Local fallback
If the API/database is temporarily unavailable, the app keeps a local browser copy so the interface can still be opened. It will sync to the shared bank once the server is available and the administrator signs in.

## Important
Do not put the database connection string or administrator password in `app.js`. They belong in Vercel Environment Variables. The old hard-coded administrator password has been removed from the frontend.
