# Google Sheets + Apps Script setup

This is the only server-side piece required by the production version. GitHub Pages hosts the React app; Google Apps Script is the thin API in front of your private Google Sheet.

## 1. Create the private spreadsheet

Create a new Google Sheet. Do **not** publish it to the web.

Open **Extensions → Apps Script** and replace the generated `Code.gs` with the supplied `Code.gs`.

## 2. Initialise the database

In Apps Script:

1. Select `setupStudio` in the function dropdown.
2. Run it.
3. Approve the Google permissions.
4. The script creates these tabs:

- `Settings`
- `Users`
- `Students`
- `Syllabus`
- `Grades`
- `Practice`
- `PracticeSignoffs`
- `Resources`
- `Audit`

The first row of each tab is the required header.

## 3. Add real data

The recommended columns are documented by the headers. Use IDs that do not contain sensitive information, for example `S001`.

For `Syllabus.objectives`, put one objective per line in the cell.

For `Practice.days_done`, use seven comma-separated boolean values, for example:

`true,true,true,false,false,false,false`

## 4. Create access codes

For the initial setup only, you can run `createInitialAccessCodes()`.

**Do not use the sample codes in a live studio. Replace them before sharing the portal.**

Access codes are stored as plain text in the `Users` sheet's `access_code` column. That's fine here because the spreadsheet itself is private — nobody but the sheet owner can open it, and the public website never receives the sheet's contents, only the data the API decides to return after a successful login. To add a real student, just add a row to `Users` with a role, a link to their `student_id`, and a memorable access code (e.g. `EMMA-4821`).

## 5. Deploy the API

Apps Script → **Deploy → New deployment**

- Type: **Web app**
- Execute as: **Me**
- Who has access: **Anyone**

Copy the URL ending in `/exec`.

## 6. Connect the website

Open `public/config.js` and set:

```js
window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
  STUDIO_NAME: "STS Keyboard",
  ACADEMIC_YEAR: "2026–27"
};
```

Do not put spreadsheet IDs, service-account credentials, API keys or access codes in this file.

## 7. Deploy the frontend

Run:

```bash
npm install
npm run build
```

Then publish the repository to GitHub and enable GitHub Pages using the included Actions workflow.

The workflow builds the Vite app and publishes `dist`.

## Security model

- Spreadsheet remains private — this is what actually protects the access codes, not encryption.
- Browser never talks directly to Sheets.
- Successful login creates a short-lived session token; the token itself (not the access code) is what the browser holds onto.
- Session tokens are stored server-side in Apps Script CacheService and expire automatically after 6 hours.
- Student/parent bootstrap is scoped to the mapped student.
- Teacher-only write endpoints enforce the teacher role.
- Login attempts are rate-limited per code to slow down guessing.
- Audit events are written to the `Audit` sheet.
- The static website contains no credentials.

## Important production note

Google Apps Script is a lightweight serverless API, not a traditional paid backend. It is necessary here because a private Google Sheet cannot safely be queried or written directly from a public GitHub Pages page.

For a real studio, also enable 2-step verification on the Google account that owns the spreadsheet and restrict who can edit the spreadsheet.
