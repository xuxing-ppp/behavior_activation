# Repository Guidelines

## Project Structure & Module Organization

微光 (Weiguang) is a local-first behavior activation app served as static files through GitHub Pages. `index.html` contains the page shell and ordered script references; no build step is required.

- `src/`: vanilla JavaScript modules and `styles.css`; see `src/README.md` for responsibilities.
- `src/vendor/`: pinned Supabase SDK and license; avoid manual edits.
- `assets/icons/` and `manifest.webmanifest`: browser and installed-app branding.
- `tests/`: workflow, synchronization, deletion endpoint, and browser checks.
- `supabase/`: database setup SQL, function configuration, and the `delete-account` Edge Function.

Modules share `window.Weiguang`, declare dependencies near the top, and export through `Object.assign`. Preserve deferred script order: `config.js` first, `app.js` last. Keep startup wiring in `app.js`.

## Build, Test, and Development Commands

Run from the repository root:

```sh
python3 -m http.server 8000        # Serve at http://localhost:8000/
node tests/workflows.test.js       # Activity, mood, import/export workflows
node tests/sync.test.js            # Merge, offline, account, and sync behavior
node tests/delete_account.test.mjs # Endpoint authorization; Node 24+ required
python3 tests/sync_browser.py      # Browser checks; start the server first
node --check src/sync.js           # JavaScript syntax check
git diff --check                  # Whitespace check
```

Browser checks require Python Playwright and Chromium. `file://` supports local use; OAuth requires HTTP/HTTPS and configured redirect URLs.

## Coding Style & Naming Conventions

Use four-space indentation in application JavaScript and TypeScript, single-quoted strings, semicolons, and camelCase identifiers. Match surrounding CSS, HTML, and test formatting. Keep modules focused and route UI actions through `data-action` and `src/events.js`. Escape user content with `utils.e()`. No formatter or linter is configured.

## Testing Guidelines

JavaScript checks use Node assertions and VM adapters; browser checks use Playwright. Name checks descriptively in `*.test.js`, `*.test.mjs`, or `*_browser.py`. No coverage percentage is enforced. Add behavioral regression checks for meaningful changes, especially persistence failures, conflicts, account isolation, and deletion. Use disposable accounts for live destructive tests. Keep screenshots under ignored `tests/artifacts/`.

## Commit & Pull Request Guidelines

History uses short, descriptive subjects, such as `inspiration system`; Conventional Commits are not required. Keep commits focused. PRs should describe behavior, validation, configuration changes, and related issues when applicable. Include desktop/mobile screenshots for UI changes.

## Security & Configuration

Preserve local-first saves and explicit synchronization consent. Never commit personal exports, OAuth client secrets, or administrator keys. Public Supabase URLs and publishable keys belong in frontend configuration; privileged deletion stays server-side. Preserve row-level security, revision checks, and JWT verification. Database/function deployment is separate from publishing static files.
