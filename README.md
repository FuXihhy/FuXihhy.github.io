# Haiyang Huang — academic homepage

Personal academic website: <https://fuxihhy.github.io/>.

## Edit the content

Edit the Markdown files directly; no JSON schema is needed for prose.

| Content | File |
| --- | --- |
| About and contact details | `content/about.md` |
| Research | `content/research.md` |
| Notes | `content/notes.md` |
| Student Seminar | `content/student-seminar.md` |
| Projects and other interests | `content/miscellany.md` |
| Homological Algebra note page | `content/notes/homological-algebra.md` |
| Name, affiliation and companion configuration | `content/site.json` |
| Photo | `public/images/me.jpg` |
| Layout and reading width | `src/style.css` |

See [the editing guide](docs/CONTENT.md) for Markdown examples and note attachments.
The Photo link opens the full photograph. The desktop reading column is 680px;
smaller screens reflow automatically.

## Local development

Requires Node.js 22.12 or later; GitHub Actions uses Node 24.

```sh
npm ci
npm run dev
```

Local preview: <http://127.0.0.1:5173/>. Saving a Markdown file refreshes it.

```sh
npm run build
npx playwright install chromium
npm test
```

The production build is generated in `dist/`. Content, math and note pages are
rendered as static HTML; JavaScript adds navigation and the optional 02 companion.

## Publish updates

Commit changes to `main`. The **Publish homepage to GitHub Pages** workflow
checks the content, builds the website, runs browser checks and deploys `dist/`.
It can also be run manually from the Actions tab. Repository Settings → Pages
uses **GitHub Actions** as its source.

The workflow reads the Pages base path, so root and repository-path hosting are
supported. Local design history, screenshots, dependency files and build outputs
are excluded from source control. The site includes the owner's requested photo,
notes and desktop-pet assets; public availability does not grant additional
reuse rights.
