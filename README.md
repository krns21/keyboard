# STS Keyboard

A polished private student/parent/teacher portal designed for free GitHub Pages hosting with a private Google Sheet as storage and Google Apps Script as the API layer (serverless-style, with no paid/traditional backend).

## What is included

### Parent
- Private access-code login
- Child dashboard
- Current and historical lesson grades
- Teacher feedback
- Full-year syllabus
- Weekly practice view
- One-click weekly parent practice sign-off
- Training resources

### Student
- Private access-code login
- Own syllabus
- Training resources
- Own grade history and trend
- Weekly practice

### Teacher
- Teacher-only login
- Studio overview
- Student roster
- Add/edit/deactivate students
- Weekly grade entry
- Practice/sign-off monitoring
- Annual syllabus editing
- Resource library
- Audit trail on important writes

## Architecture

```text
GitHub Pages
    │
    │ HTTPS JSON requests
    ▼
Google Apps Script Web App
    │
    │ Spreadsheet service
    ▼
Private Google Sheet
```

There is deliberately no direct browser-to-Sheets connection. A published Google Sheet would expose student information. Apps Script provides the minimum secure API boundary needed for private data.

## Local development

```bash
npm install
npm run dev
```

The production build is:

```bash
npm run build
```

## Connect Google Sheets

See `apps-script/README.md`.

After deploying Apps Script, set `API_URL` in `public/config.js` to the `/exec` URL and deploy the GitHub Pages site.

## GitHub Pages

The included `.github/workflows/deploy.yml` automatically:

1. checks out the repository
2. installs dependencies
3. runs `npm run build`
4. publishes `dist`

Enable **Settings → Pages → Source: GitHub Actions** in the repository.

## Data protection

Do not:
- publish the Google Sheet
- put access codes in frontend source
- put Google credentials in GitHub
- put spreadsheet IDs or secrets in `config.js`

The app is intentionally designed so that the browser only receives the data allowed for its authenticated role.

## Before going live

1. Create the private Google Sheet.
2. Run `setupStudio()`.
3. Add real students and syllabus.
4. Create real access codes and replace all sample credentials.
5. Deploy the Apps Script web app.
6. Add the `/exec` URL to `public/config.js`.
7. Build and publish to GitHub Pages.
8. Test parent, student and teacher accounts separately.
9. Test the weekly sign-off and grade-writing flows.
10. Keep the Google account owning the sheet protected with 2-step verification.
