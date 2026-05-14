# Study-Hub Engineering Change Log
## Complete technical breakdown of fixes and changes, from first to last

This document is a chronological engineering log of the changes made to Study-Hub. It focuses on what was changed, why it was changed, how it was implemented, and what behavior each change corrected.

---

## PHASE 1 — PDF PROCESSING, PARSING, AND DATA SANITIZATION

### 1) Replaced `pdf-parse` after silent extraction failures

#### Problem
The original PDF pipeline used `pdf-parse`, but it failed on a large class of real-world PDFs. The failure mode was especially dangerous because it was often silent: instead of throwing a hard error, the parser would sometimes return empty or partially extracted text. That meant downstream code would treat the extraction as successful and proceed to save broken content into the database.

This was not just a parsing issue. It was a data integrity issue. If a PDF could not be reliably converted into text, the rest of the system would happily store incomplete content, and the user would only discover the problem much later, if at all.

#### Change
`pdf-parse` was replaced with a two-stage parsing strategy:

- `unpdf` as the primary parser
- `pdfjs-dist` as the fallback parser

The new structure turned PDF extraction into a fault-tolerant pipeline rather than a single dependency point. If the first parser could not handle a document, the second parser could still attempt recovery.

#### Technical details
The new flow was built to validate the output of the primary parser before accepting it. If the output was empty or obviously malformed, the code fell back to the secondary parser. This meant the system no longer trusted a single library blindly.

The new model was effectively:

- attempt extraction with `unpdf`
- normalize the returned content
- validate the resulting text
- if invalid, retry with `pdfjs-dist`
- emit a usable plain-text string for the rest of the backend

#### Why this mattered
This fixed one of the most important classes of production failures: silent corruption. The system now behaves defensively around PDFs instead of assuming every file is well-formed.

---

### 2) Fixed `unpdf` page-array output handling

#### Problem
`unpdf` did not behave like the previous parser. Instead of returning a single merged string by default, it returned page-wise text structures. That output shape was not directly compatible with the rest of the Study-Hub backend, which expected a unified text body.

#### Change
The extraction code was updated to handle the `unpdf` output correctly by using:

- `mergePages: true`
- `getDocumentProxy()`

#### Technical details
This update made the parser output consistent with the rest of the application by converting page-based text into a single merged document. Without this step, downstream code would have had to manually stitch the pages together, which would increase fragility and duplicate logic.

#### Why this mattered
A parser can be technically correct and still be unusable if its output shape does not match the consuming system. This change aligned the parser with the backend’s expected text pipeline.

---

### 3) Fixed `pdfjs-dist` ESM compatibility issues

#### Problem
`pdfjs-dist` v5+ is ESM-only, while the backend was still using CommonJS patterns. That meant `require()` could not load the module directly, which caused runtime failures.

#### Change
The backend switched from static CommonJS loading to dynamic import syntax:

```js
await import('pdfjs-dist/legacy/build/pdf.mjs')
```

#### Technical details
The legacy build path was used specifically because it is more compatible with Node.js server environments. Dynamic import allowed the backend to keep its existing structure while still loading a modern ESM package.

#### Why this mattered
This avoided a full repository-wide migration from CommonJS to ESM just to support one library. That kept the change local, controlled, and low-risk.

---

### 4) Disabled worker threads for PDF parsing

#### Problem
The PDF parsing stack caused instability in some Node.js environments when worker threads were used. The combination of host restrictions and parser behavior made this unreliable on production deployments.

#### Change
Worker usage was disabled for the PDF parsing flow.

#### Technical details
This simplified the execution model and removed a source of instability that was not necessary for the server-side use case. Worker threads are often useful for browser-side or highly parallel workloads, but they can also introduce deployment-specific failures in constrained environments.

#### Why this mattered
The goal was reliability, not theoretical parallelism. Disabling workers reduced the number of moving parts and made the PDF pipeline more deterministic.

---

### 5) Added PostgreSQL null-byte sanitization

#### Problem
Some extracted PDF text contained null bytes (`\x00`). PostgreSQL rejects those characters in UTF-8 text fields, which caused insert failures and runtime crashes during persistence.

#### Change
A sanitization pass was added to remove null bytes before database writes.

```js
text = text.replace(/\0/g, '');
```

#### Technical details
The sanitization was performed immediately before insertion or update. This ensured the extraction layer could remain permissive while the storage layer stayed strict and valid.

#### Why this mattered
Binary artifacts are common in extracted text from PDFs. Without sanitization, the database would reject the payload and the user would lose the result. This fix eliminated that crash path.

---

### 6) Installed `unpdf` and `pdfjs-dist` as explicit dependencies

#### Problem
The new parsing pipeline could not function unless the relevant libraries were actually installed and tracked in the project manifest.

#### Change
The dependencies were added using `npm install`, and the package metadata was updated accordingly.

#### Technical details
This ensured that the new parser stack was reproducible across environments and not just present in a local development setup.

#### Why this mattered
A parsing refactor is not complete until the dependency graph reflects it. This made the pipeline deployable and versioned.

---

## PHASE 2 — LLM MODEL MANAGEMENT AND ROUTING

### 7) Replaced dead OpenRouter model IDs

#### Problem
The AI layer was using model IDs that were no longer working. These calls failed repeatedly, wasting time and network requests and making the AI system feel broken.

#### Change
The configured models were replaced with verified working models.

#### Technical details
This included updating both:
- the primary model in `.env`
- the fallback list in the backend model orchestration

The new set included validated models such as:
- Llama 3.3 70B
- Gemma 3 4B
- Nemotron
- `openrouter/free` as a fallback

#### Why this mattered
A model system is only useful if the selected endpoints are alive. Dead endpoints create hidden latency and degrade the user experience even when the rest of the app is functioning.

---

### 8) Reordered model priority to reduce latency waste

#### Problem
The fallback chain was ordered in a way that tried slower or less reliable models before the one that actually succeeded consistently. This meant each request could spend a long time timing out before it reached a successful model.

#### Change
`openrouter/free` was moved to the top of the priority chain, and the environment variable was updated to use it as the primary model.

#### Technical details
The change was driven by runtime logs, not guesswork. Logs showed that certain models repeatedly returned provider errors or timed out. Since `openrouter/free` was the model that reliably completed requests, it made more sense to use it first rather than last.

#### Why this mattered
This was a practical reliability optimization. It reduced wasted 60–120 second wait cycles per request.

---

### 9) Preserved a fallback chain rather than relying on one model

#### Problem
Even when the first model is good, a single dependency is still a point of failure.

#### Change
A retry loop remained in place so the backend could move through the list of available models if the primary one failed.

#### Technical details
The orchestration logic attempts each model in order, handles failures locally, and continues until a successful completion is returned.

#### Why this mattered
This preserves resilience without forcing the app into a hard dependency on one endpoint.

---

## PHASE 3 — REQUEST FLOW, ASYNC PROCESSING, AND FRONTEND SAFETY

### 10) Decoupled PDF processing from the request-response cycle

#### Problem
PDF extraction was originally part of the synchronous request path, which blocked the event loop and caused slow responses or timeouts. On constrained hosting, this became especially problematic.

#### Change
The heavy parsing task was moved into a background, fire-and-forget style process.

#### Technical details
The server now returns a success response immediately after queueing or starting the task, instead of waiting for the full extraction pipeline to finish. A safety timeout was also introduced to avoid indefinite hanging.

#### Why this mattered
This shifted the system from blocking I/O behavior to non-blocking behavior. The request can complete while the extraction continues separately.

---

### 11) Added a 60-second extraction safety timeout

#### Problem
Background tasks can hang indefinitely if a parser stalls or a file is unusually problematic.

#### Change
A timeout guard was added to stop extraction tasks that exceeded a defined runtime.

#### Technical details
This protects the server from background tasks that consume resources without making forward progress.

#### Why this mattered
Timeouts are important in any production system that handles external or third-party parsing libraries. They keep the system recoverable.

---

### 12) Added frontend idempotency with `_sendLock`

#### Problem
Users can click buttons repeatedly, especially when the UI feels slow or unresponsive. That can trigger duplicate requests and create duplicate records in the database.

#### Change
A frontend lock variable was added to prevent duplicate submission while a request is already in progress.

#### Technical details
The lock is set before the request and cleared when the request completes or fails. That makes the UI effectively idempotent at the interaction layer.

#### Why this mattered
This prevents accidental duplicate writes and protects database consistency.

---

## PHASE 4 — STORAGE INTEGRITY AND FILESYSTEM RECONCILIATION

### 13) Fixed orphaned files after folder deletion

#### Problem
Deleting a folder from the database did not automatically remove the physical PDF files from disk. That created orphaned files and storage leaks.

#### Change
The delete flow was updated to collect all descendant folders and associated file paths before removing them.

#### Technical details
The implementation evolved into a recursive cleanup strategy using a recursive CTE so nested subfolders could be traversed cleanly. Once the list of file paths was collected, the code deleted the corresponding files from disk before the database cascade removed the records.

#### Why this mattered
Without file cleanup, the database and filesystem diverge. Over time, that creates wasted disk space and stale artifacts.

---

### 14) Added startup reconciliation between disk and database

#### Problem
Files could exist on disk without corresponding database rows, and database rows could exist without physical files. Either condition causes drift.

#### Change
A startup reconciliation routine was added to repair both directions of mismatch.

#### Technical details
Two passes were used:

1. Disk to DB:
   - scan the upload directory
   - compare file names against database rows
   - delete files that are not represented in the DB
   - remove empty directories

2. DB to Disk:
   - query database file paths
   - check whether each path exists
   - remove DB rows whose files are missing

#### Why this mattered
This made the storage layer self-healing and reduced the risk of accumulating broken references.

---

### 15) Removed empty directories after file cleanup

#### Problem
Even after deleting orphaned files, directory skeletons could remain behind.

#### Change
Empty folders were removed during the cleanup pass.

#### Technical details
This keeps the filesystem tidy and reduces unnecessary directory clutter.

#### Why this mattered
It makes the storage layer closer to a fully reconciled state.

---

## PHASE 5 — CHAT PERSISTENCE AND MANUAL NOTE MANAGEMENT

### 16) Added `linked_note_id` to chat sessions

#### Problem
Chat sessions and notes were separate systems. That meant chat knowledge stayed ephemeral unless explicitly copied somewhere else.

#### Change
A new foreign key field was added so each chat session could optionally link to a persistent note.

#### Technical details
The schema was updated with a nullable reference field on chat sessions. The migration used conditional schema logic so it could be safely applied even if the table already existed.

#### Why this mattered
This created a bridge between transient conversation and persistent knowledge.

---

### 17) Implemented automatic note creation for chat sessions

#### Problem
The old flow did not have a proper note container for sessions that should persist.

#### Change
On the first save, a note is created automatically and linked back to the session. Future assistant responses can then be appended to the same note.

#### Technical details
The backend constructs Q&A pairs in a structured format and appends them to the existing note content. If a note does not yet exist, it creates one and stores the ID in the session.

#### Why this mattered
It turned chat from a disposable interaction channel into an accumulating knowledge source.

---

### 18) Generalized session updating logic

#### Problem
The previous update routine was too narrow and only handled one field cleanly.

#### Change
The update function was rewritten to support dynamic field updates, including both title and linked note metadata.

#### Technical details
The query builder now conditionally assembles the `UPDATE` statement based on what fields are present.

#### Why this mattered
This makes the session update path more flexible and easier to extend.

---

### 19) Removed automatic background note accumulation

#### Problem
Auto-saving every response into notes was too aggressive and removed user control.

#### Change
The legacy automatic note accumulation behavior was removed from the backend.

#### Technical details
This prevented unsolicited persistence and gave note saving back to the user as an explicit action.

#### Why this mattered
Manual control is better for privacy and intent. It avoids bloating the notes system with content the user did not want saved.

---

### 20) Added manual “Add to Notes” save flow

#### Problem
Users needed a way to save useful chat content intentionally.

#### Change
A dedicated frontend action was created to let the user save selected chat content into notes manually.

#### Technical details
The frontend extracts a note title using regex-based logic and then creates or updates the note asynchronously.

#### Why this mattered
This preserved privacy while keeping the productivity benefit of turning chat into reusable notes.

---

### 21) Added cross-module refresh via custom events

#### Problem
After saving content from chat into notes, the notes UI needed to refresh immediately without requiring a page reload.

#### Change
A custom event system was added using the `window` object.

#### Technical details
The chat module dispatches a `notes:refresh` event, and the Notes module listens for that event and reloads its content.

#### Why this mattered
This kept the system decoupled while still allowing live UI synchronization.

---

## PHASE 6 — SEARCH SYSTEM

### 22) Replaced weak exact-match search with fuzzy scoring

#### Problem
Exact substring search misses too many real-world queries. Users make typos, use partial words, and remember phrases imperfectly.

#### Change
A fuzzy search layer was added on top of the original search behavior.

#### Technical details
The scoring system includes:
- Levenshtein edit distance
- Bigram similarity
- Prefix matching

The engine scores candidates based on how similar they are to the query rather than relying only on direct matches.

#### Why this mattered
This made search much more tolerant of imperfect input.

---

### 23) Built a two-phase search architecture

#### Problem
Searching only on the server caused latency, while searching only the client missed deep message history.

#### Change
A hybrid two-phase search model was introduced.

#### Technical details
Phase 1:
- instant search over cached sessions in the browser

Phase 2:
- server-side deep search over all message content

The results are merged and deduplicated before display.

#### Why this mattered
It gives users instant feedback while still allowing deeper retrieval.

---

### 24) Added deduplication and ranking for search results

#### Problem
Combining client and server search can produce duplicate or redundant results.

#### Change
The final result list is merged, filtered, and ranked.

#### Technical details
The same session can appear in both the local and remote result sets, so the logic removes duplicates and keeps the best-scoring result.

#### Why this mattered
That prevents noisy search output and makes the experience feel more deliberate.

---

### 25) Added highlighted matches and contextual snippets

#### Problem
Search results are less useful if users cannot see what matched.

#### Change
The interface now displays highlighted matches and snippets around the match.

#### Technical details
The snippet extractor pulls text around the matched region so the user gets local context instead of a bare title.

#### Why this mattered
Search becomes explainable. Users can see why a result appeared.

---

## PHASE 7 — RESPONSIVE DESIGN, GLASSMORPHISM, AND MOBILE FIXES

### 26) Fixed the glass theme sidebar specificity conflict on mobile

#### Problem
A glass theme rule overrode the mobile sidebar behavior because it had higher CSS specificity.

#### Change
A matching-specificity mobile override was added in the glass stylesheet.

#### Technical details
The glass sidebar was forced back into fixed-position overlay mode on mobile so it could behave like the non-glass layout.

#### Why this mattered
Without this, the sidebar stayed in document flow and broke the mobile layout.

---

### 27) Increased glass theme opacity and blur on mobile

#### Problem
Glass theme looked too transparent on smaller screens, where background bleed-through made the UI hard to read.

#### Change
Opacity was increased and blur values were tuned for mobile screens.

#### Technical details
The glass panels now use more opaque backgrounds on mobile, while preserving the glass look.

#### Why this mattered
Glassmorphism on desktop does not automatically work on mobile. Readability has to be rebalanced.

---

### 28) Added multiple mobile breakpoint overrides

#### Problem
One-size-fits-all responsive CSS was not enough.

#### Change
Separate breakpoint blocks were added for 768px, 480px, and 360px.

#### Technical details
Each breakpoint adjusts layout density, typography, padding, and component widths.

#### Why this mattered
The app now degrades gracefully across a range of device sizes.

---

### 29) Improved note modal and PDF viewer responsiveness

#### Problem
Modal headers and viewer controls could overflow on narrow screens.

#### Change
Headers were allowed to wrap, titles were constrained, and controls were compacted.

#### Technical details
This included flex wrapping, smaller paddings, and max-width limits for long titles.

#### Why this mattered
It prevents layout breakage in smaller viewport widths.

---

### 30) Added full glass search UI styling

#### Problem
Search elements did not visually fit into the glass theme.

#### Change
Search input, icons, clear buttons, highlights, snippets, and empty states were given glass-specific styles.

#### Technical details
Theme-specific overrides were added so search components remained readable and visually consistent under the glass palette.

#### Why this mattered
The search system now looks native to the rest of the app.

---

## PHASE 8 — NESTED FOLDER SYSTEM

### 31) Added `parent_id` to folder tables

#### Problem
Folders were flat and could not represent hierarchy.

#### Change
Both note and PDF folder tables were extended with `parent_id`.

#### Technical details
The relation is self-referential, allowing one folder to point to another folder in the same table as its parent. `ON DELETE CASCADE` ensures that deleting a parent also deletes descendants.

#### Why this mattered
This is the core data model change that made nested folders possible.

---

### 32) Added recursive tree rendering in the frontend

#### Problem
Flat folder lists do not communicate hierarchy well.

#### Change
The frontend now builds a tree from the flat list and renders it recursively.

#### Technical details
The code maps parent IDs to children arrays and then recursively creates DOM nodes for each subtree.

#### Why this mattered
The sidebar now reflects actual folder structure, not just a flat list of names.

---

### 33) Added collapse/expand persistence

#### Problem
Users should not lose their sidebar state every time they refresh the page.

#### Change
Collapsed folder IDs are stored in session storage.

#### Technical details
A Set-like structure tracks which folders are collapsed, and those IDs are used to restore the tree state on reload.

#### Why this mattered
The UI feels much more stable and predictable.

---

### 34) Added breadcrumb navigation for nested folders

#### Problem
Deep trees are easy to get lost in.

#### Change
Breadcrumbs were added above the folder grids.

#### Technical details
The breadcrumb trail is built by walking up the parent chain until the root is reached.

#### Why this mattered
Users can now orient themselves inside the hierarchy quickly.

---

### 35) Fixed the `parent_id = null` edit bug

#### Problem
Editing a folder sometimes cleared its parent relationship accidentally, detaching it from the tree.

#### Change
Create and update payloads were separated so `parent_id` is only sent on create.

#### Technical details
The edit path no longer inherits create-time parent logic. This prevents hierarchy corruption during edits.

#### Why this mattered
This was one of the most important data integrity fixes in the folder system.

---

### 36) Added cycle detection for folder moves

#### Problem
Folders could potentially be moved into their own descendant chain, creating a cycle.

#### Change
The backend now walks the ancestor chain before allowing a move.

#### Technical details
If the target folder already appears somewhere in the ancestry of the proposed parent, the move is rejected.

#### Why this mattered
Cycles would break traversal and recursive rendering. This prevents that entire class of bugs.

---

### 37) Limited folder depth to 3 levels

#### Problem
Unlimited nesting makes the UI hard to use and the logic more complex.

#### Change
A hard maximum depth of 3 was enforced.

#### Technical details
The backend validates depth, and the frontend disables new subfolder creation when the max depth is reached.

#### Why this mattered
This is a deliberate design boundary that keeps the system usable and predictable.

---

### 38) Added shared color picker behavior for folders

#### Problem
The PDF module was missing the folder color picker behavior that existed in the Notes module.

#### Change
The folder color system was made shared and available in both modules.

#### Technical details
This restored feature parity across Notes and PDFs.

#### Why this mattered
The two major content areas now behave consistently.

---

## PHASE 9 — STREAMING CHAT UX AND THINKING ORCHESTRATION

### 39) Added `<think>` block parsing to streaming responses

#### Problem
The assistant’s internal reasoning and final response were mixed together during streaming.

#### Change
The frontend streaming logic was updated to detect `<think>` blocks and split them from the final answer.

#### Technical details
The parser uses string slicing and tag boundary detection to separate reasoning content from answer content while the stream is still arriving.

#### Why this mattered
The app can now render reasoning and final output separately.

---

### 40) Built a collapsible thinking component

#### Problem
Reasoning content needs to be visible without overwhelming the main response view.

#### Change
A collapsible thinking UI was added.

#### Technical details
The thinking block starts expanded during stream generation and can collapse after completion using a toggle control.

#### Why this mattered
It makes the reasoning visible when useful, but not intrusive when the answer is done.

---

### 41) Added streaming status animations

#### Problem
Users need visual feedback during long responses.

#### Change
Animated states such as “Connecting to model…” and “Model is thinking…” were added.

#### Technical details
Pulse-style keyframe animations and placeholder labels show that the stream is active.

#### Why this mattered
It improves perceived responsiveness during generation.

---

### 42) Implemented desktop split-view rendering

#### Problem
Long AI messages are easier to read when the raw stream and final answer are visually separated on large screens.

#### Change
A desktop-only two-column layout was added.

#### Technical details
The left column shows stream or reasoning content, while the right column shows the final Markdown-rendered output.

#### Why this mattered
This gives desktop users a premium, information-dense view without affecting mobile readability.

---

### 43) Reconstructed split layouts for historical messages

#### Problem
Older messages should render in the same split format as new ones.

#### Change
Message bubble construction was updated to rebuild split layouts from stored content.

#### Technical details
The reconstruction logic parses the saved message structure and rehydrates the dual-pane display.

#### Why this mattered
The UI stays consistent across new and historical chat content.

---

### 44) Added smart auto-scroll suppression

#### Problem
Auto-scrolling on every new token causes scroll-jumping when users are trying to read previous content.

#### Change
Auto-scroll now only activates if the user is already near the bottom.

#### Technical details
If the user scrolls upward, the stream no longer forcibly pulls the viewport down.

#### Why this mattered
This made long chat sessions much more readable.

---

## PHASE 10 — GLASSMORPHISM AND UI POLISH

### 45) Expanded glass theme coverage across the app

#### Problem
Glass styling was not applied consistently across all components.

#### Change
Glass-specific overrides were added broadly across the UI.

#### Technical details
The theme is scoped under selectors like `[data-theme^="glass-"]`, which keeps the styling isolated from non-glass themes.

#### Why this mattered
This preserved theme consistency without breaking the default look.

---

### 46) Applied glass styling to user bubbles, AI bubbles, inputs, and controls

#### Problem
Some components still looked solid while others were glassy.

#### Change
User bubbles were converted to glass panels and other key controls were restyled with blur and transparency.

#### Technical details
RGBA backgrounds and backdrop blur were applied in a balanced way so the app still stays readable.

#### Why this mattered
The app now feels visually coherent rather than partially themed.

---

### 47) Increased AI message width on desktop

#### Problem
Large monitors were not being used efficiently.

#### Change
AI bubbles were allowed to grow wider, up to 90% of the available container.

#### Technical details
This reduces unnecessary line wrapping and makes the desktop chat view more comfortable to read.

#### Why this mattered
It improves the premium feel of the desktop interface.

---

### 48) Standardized selector and control sizing

#### Problem
The model selector and related controls felt visually mismatched.

#### Change
Their paddings and widths were aligned more closely.

#### Why this mattered
Small alignment details matter a lot in a polished UI.

---

## PHASE 11 — AUTHENTICATION AND ACCOUNT RECOVERY

### 49) Built password reset flow

#### Problem
Users needed a way to recover access without manual admin intervention.

#### Change
A secure password reset flow was created using Nodemailer and Gmail.

#### Technical details
The flow generates a token, sends it by email, and allows the user to set a new password through a reset interface.

#### Why this mattered
This is a standard production-auth feature and a major usability improvement.

---

### 50) Configured zero-cost email authentication infrastructure

#### Problem
Auth recovery should not require expensive external services.

#### Change
The system was configured to use Gmail App Passwords.

#### Technical details
This keeps the entire email auth flow at zero monthly cost while still providing real email delivery.

#### Why this mattered
It matches the local-first, no-cloud-cost project goal.

---

### 51) Integrated forgot/reset UI into the auth flow

#### Problem
The password reset mechanics needed a user-facing interface.

#### Change
The auth screens were updated to transition cleanly between login, forgot password, and reset password states.

#### Why this mattered
The backend feature became a coherent user journey.

---

## PHASE 12 — BUILD PIPELINE, MODULE SYSTEM, AND DEPLOYMENT

### 52) Migrated to Vite

#### Problem
The old script loading style was not modern enough for a larger frontend.

#### Change
The project moved to a Vite production build pipeline.

#### Technical details
This brought:
- bundling
- minification
- cache-busting hashed files
- better dev/prod separation

#### Why this mattered
It made the frontend build more maintainable and deployment-ready.

---

### 53) Added a dual-dev workflow with `concurrently`

#### Problem
Running frontend and backend separately is tedious during development.

#### Change
A combined development workflow was added.

#### Technical details
This allows the app to run both the dev server and the backend in parallel.

#### Why this mattered
It simplified local development.

---

### 54) Refactored frontend code to ES modules

#### Problem
A modern build system works better when the JS modules are structured cleanly.

#### Change
All major frontend JS files were refactored to ES modules while still preserving necessary shared access through `window`.

#### Why this mattered
This improved maintainability and fit the new Vite-based pipeline.

---

### 55) Added auto-schema application on server boot

#### Problem
The schema should repair itself on startup rather than relying on manual intervention.

#### Change
The database schema is applied automatically when the server starts.

#### Technical details
The schema script uses idempotent logic so it can safely run in environments where the tables already exist.

#### Why this mattered
This is the core of the self-healing backend model.

---

### 56) Added production deployment configuration for Render

#### Problem
The deployment pipeline needed to know how to build and start the new app structure.

#### Change
`render.yaml` and deployment commands were updated to match the current build flow.

#### Why this mattered
This restored “git push to deploy” behavior.

---

## PHASE 13 — LOCAL-FIRST INFRASTRUCTURE AND SELF-HOSTING

### 57) Built a distro-independent setup script

#### Problem
The project needed to be easy to bring up on different Linux distributions.

#### Change
A `setup.sh` script was created that detects the local package manager and installs dependencies accordingly.

#### Technical details
The script handles package manager differences such as:
- `apt`
- `dnf`
- `pacman`
- `brew`

#### Why this mattered
This makes the project easier to bootstrap on different machines.

---

### 58) Automated PostgreSQL installation and initialization

#### Problem
Database setup can be one of the most error-prone parts of onboarding.

#### Change
The setup script handles PostgreSQL installation and initialization.

#### Technical details
It also generates secure credentials and prepares the database for the app.

#### Why this mattered
This reduces manual setup steps and lowers the chance of mistakes.

---

### 59) Automated `.env` generation

#### Problem
Environment variable setup can be tedious and error-prone.

#### Change
The script uses stream editing to generate or patch the environment configuration.

#### Why this mattered
It keeps setup repeatable and easier for future local runs.

---

### 60) Added Ollama installation support

#### Problem
The project’s local-first AI mode needed a straightforward inference backend.

#### Change
The setup automation includes Ollama installation and model guidance.

#### Why this mattered
This aligns the app with its goal of working locally without cloud dependency.

---

### 61) Rewrote the README around the local-first product identity

#### Problem
The repository documentation needed to reflect the actual product direction.

#### Change
The README was rewritten to frame Study-Hub as a local-first study utility rather than a cloud-only MVP.

#### Why this mattered
The documentation now matches the project’s philosophy and usage model.

---

## PHASE 14 — LANDING PAGE, THEME CONTINUITY, AND NAVIGATION

### 62) Built a premium landing page

#### Problem
The app needed a polished first impression.

#### Change
A glassmorphic showcase-style landing page was added with floating orbs and reveal animations.

#### Why this mattered
It turned the project from a plain utility into something that feels polished and intentional.

---

### 63) Added theme continuity across landing and auth

#### Problem
The landing page used a special look, but user theme preferences still needed to be restored after login.

#### Change
A specialized landing theme is used temporarily, then the user’s personal theme is restored after authentication.

#### Why this mattered
It preserves both branding and personalization.

---

### 64) Fixed browser back navigation using the History API

#### Problem
The transition between landing and auth screens did not always behave correctly with browser back actions.

#### Change
The History API was used to make back-button navigation work properly.

#### Why this mattered
This makes the navigation feel like a real web app instead of a fragile sequence of screen swaps.

---

### 65) Fine-tuned glass theme readability

#### Problem
The glass theme still needed contrast tuning in a few places, especially the dropdowns and user controls.

#### Change
Opacity and visual hierarchy were adjusted for readability.

#### Why this mattered
Small polish changes can have a huge effect on perceived quality.

---

## FINAL STATE

Study-Hub evolved from a feature-heavy prototype into a self-healing, local-first, production-aware knowledge platform.

The biggest themes across the entire changelog are:

- replacing fragile single-point dependencies with fallback systems
- keeping database and filesystem state synchronized
- making the UI responsive, readable, and stateful
- preserving user intent instead of forcing automatic behavior
- making the app usable without cloud dependency
- hardening the backend for real deployment constraints

This is not just a list of features.

It is the story of turning a working app into a resilient system.

---

If you want the same document split into smaller sections, or converted into a cleaner report format, I can reformat this into a version with a title page, chapter headings, and a table of contents.
