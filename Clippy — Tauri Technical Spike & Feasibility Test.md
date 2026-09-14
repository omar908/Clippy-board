# Clippy — Tauri Technical Spike & Feasibility Test

## 1. Purpose

Build a small technical prototype of **Clippy**, a lightweight Windows clipboard manager, using:

- **Tauri**
- **Rust**
- **TypeScript**
- **HTML/CSS**
- **SQLite or an equivalent lightweight persistence mechanism only if needed for the spike**

This is a **technical feasibility spike**, not the implementation of the complete Clippy MVP.

The primary objective is to determine whether Tauri can provide the Windows-native behavior and responsiveness required by Clippy while allowing us to build a highly polished, custom UI.

The prototype should intentionally remain small.

---

# 2. Product Context

Clippy is intended to be:

- Fast
- Minimal
- Keyboard-first
- Modern
- Pragmatic

The primary differentiator is expected to be **UX**, rather than technical functionality.

Windows already provides clipboard history, so simply storing copied content is not sufficient to make Clippy compelling. The eventual product needs to make retrieving and reusing clipboard content substantially better through interaction design, speed, search, presentation, and keyboard interaction.

For this spike, however, do not attempt to solve the complete UX.

We are primarily testing whether the underlying technology can support it.

---

# 3. MVP Context

The eventual MVP is divided into two phases.

## MVP Phase 1 — Core

- Windows
- Clipboard history
- Persistent history
- Text support
- Image support
- File support
- Search
- Basic selection
- Copy mode

### Copy mode

When the user selects a historical clipboard item:

1. Clippy places that item's content onto the Windows clipboard.
2. Clippy closes.
3. The user performs the normal Windows paste operation themselves.

Clippy does **not** directly inject/paste the content into the target application in Phase 1.

## MVP Phase 2 — Enrichment

These are intentionally deferred from Phase 1:

- Keyboard navigation
- Global shortcut
- Pin items
- Delete individual items
- Configurable retention

## Ideas / Later

These are not committed features:

- Paste mode / direct paste
- Privacy exclusions
- Smart previews
- Transformations
- Snippets
- Workspaces

Do not implement these as part of the spike unless required to test a technical dependency.

---

# 4. Technical Direction

Preferred stack:

- **Tauri**
- **Rust**
- **TypeScript**
- **HTML/CSS**
- Windows APIs where required
- SQLite is the likely eventual persistence layer

The intended architecture is:

```text
┌──────────────────────────────────────┐
│              Clippy UI               │
│        TypeScript / HTML / CSS       │
└──────────────────┬───────────────────┘
                   │
                   │ Tauri commands/events
                   ▼
┌──────────────────────────────────────┐
│            Native Core               │
│                Rust                  │
│                                      │
│  Clipboard                           │
│  Windows integration                 │
│  Window lifecycle                    │
│  Global shortcut                     │
│  Persistence                         │
└──────────────────────────────────────┘
                   │
                   ▼
             Windows APIs
```

Keep the boundary between frontend and Rust explicit.

The frontend should own presentation and interaction.

Rust should own native/system responsibilities.

Avoid putting unnecessary application logic into the frontend merely to make the spike easier.

---

# 5. Spike Scope

Implement the following technical flow:

```text
Windows clipboard
       │
       ▼
Clipboard monitoring
       │
       ▼
Clippy receives clipboard item
       │
       ▼
Display item in UI
       │
       ▼
User selects item
       │
       ▼
Clippy writes item to Windows clipboard
       │
       ▼
Clippy closes
```

The prototype should also demonstrate the basic popup behavior:

```text
Open Clippy
    ↓
Window appears
    ↓
Search input is focused
    ↓
User types
    ↓
Results update
    ↓
User selects an item
    ↓
Item becomes Windows clipboard
    ↓
Clippy closes
```

The exact visual design is not important yet.

The interface should be deliberately simple and clean.

---

# 6. Required Technical Tests

## A. Tauri startup

Verify:

- Application launches successfully on Windows.
- Startup is responsive.
- No visible console window in the normal application build.
- The application can remain running in the background.

Record approximate startup behavior.

Do not optimize aggressively at this stage; the purpose is to establish a baseline.

---

## B. Clipboard monitoring

Implement clipboard monitoring for at least:

### Text

Example:

```text
Hello from Clippy
```

### Image

Copy an image using a normal Windows application.

Verify Clippy detects it and can represent it in its internal clipboard history.

### File

Copy a file using Windows Explorer.

Verify Clippy detects the file clipboard content.

The prototype does not need a sophisticated representation for each type.

The important question is:

> Can Tauri/Rust reliably observe the clipboard content types Clippy needs?

---

# 7. Clipboard History

Maintain an in-memory history during the spike.

Do not spend significant time building the final persistence architecture.

Each history item should have enough information to distinguish it from other items.

A conceptual model:

```text
ClipboardItem
├── id
├── timestamp
├── type
└── content
```

The exact implementation is up to the agent.

Avoid premature abstractions.

---

# 8. Search

Implement a basic search field.

Requirements:

- Search input should accept text immediately.
- Results should update as the user types.
- Search should operate against text clipboard items.
- Matching should be fast enough to feel instantaneous for a small history.

The search implementation does not need to represent the final search architecture.

The purpose is to test the frontend interaction and communication between frontend and Rust.

---

# 9. Selection and Copy Mode

The prototype must allow the user to select a clipboard history item.

On selection:

1. Retrieve the item's original content.
2. Write it to the Windows clipboard.
3. Close the Clippy window.

Then verify externally that the content can be pasted using normal Windows paste behavior.

For example:

```text
Copy "Hello World"
       ↓
Open Clippy
       ↓
Select "Hello World"
       ↓
Clippy writes it to Windows clipboard
       ↓
Clippy closes
       ↓
Open Notepad
       ↓
Ctrl+V
       ↓
"Hello World"
```

This behavior is essential.

Do not implement direct paste into the target application.

---

# 10. Window Behavior

Test a lightweight popup-style window.

Requirements:

- Borderless/custom window is preferred if practical.
- The window should be visually simple.
- The search field should receive focus when the window opens.
- Closing the window should return control to the previous application.
- Escape should close the window.
- The window should not behave like a conventional large desktop application window.

The final window positioning rules are not defined yet.

For the spike, choose a sensible location and document the implementation.

---

# 11. Global Shortcut

The global shortcut belongs to **MVP Phase 2**, but it is also an important Tauri feasibility test.

Implement a basic global shortcut solely to validate Tauri's support.

Suggested temporary shortcut:

```text
Ctrl + Shift + Space
```

The exact shortcut can be changed if it conflicts with Windows or the development environment.

Expected behavior:

```text
Application running
       ↓
Press global shortcut
       ↓
Clippy window opens
       ↓
Search field receives focus
```

The shortcut does not need to be finalized as part of this spike.

---

# 12. Keyboard Interaction

Although full keyboard navigation belongs to MVP Phase 2, test enough keyboard interaction to determine whether the eventual model will work well.

At minimum:

- Shortcut opens Clippy.
- Search receives focus.
- Typing filters results.
- Escape closes Clippy.
- Enter selects the current result if a selected result exists.

Do not spend time designing the complete keyboard mapping yet.

---

# 13. Resource Usage

Run Clippy in the background and observe:

- Idle memory usage
- CPU usage while idle
- CPU behavior during clipboard monitoring
- CPU behavior during search
- Behavior after extended idle time

Exact numbers are not strict acceptance thresholds at this stage.

We mainly want to identify anything unexpectedly expensive.

Clippy should be a lightweight utility, not an application that consumes significant resources while sitting idle.

Record approximate observations.

---

# 14. Windows Integration Tests

Specifically test:

### Normal clipboard operation

```text
Application A
    ↓
Copy
    ↓
Clippy detects it
    ↓
Application A
    ↓
Paste
```

Normal Windows copy/paste must continue working.

### Clippy retrieval

```text
Application A
    ↓
Copy Item A

Application B
    ↓
Copy Item B

Clippy
    ↓
Select Item A

Application B
    ↓
Paste
    ↓
Item A
```

### Multiple clipboard types

Test:

- Text
- Image
- File

### Clipboard changes outside Clippy

Copy content from normal Windows applications while Clippy is hidden/backgrounded.

Clippy should still receive the clipboard changes.

---

# 15. Failure Cases To Test

Test at least:

- Empty clipboard
- Repeated identical copies
- Very long text
- Unicode text
- Multi-line text
- Image clipboard content
- File clipboard content
- Clipboard changed rapidly several times
- Clippy opened with no history
- Search with no results
- Closing Clippy while a clipboard operation is occurring
- Copying content while Clippy is open
- Another application changing the clipboard immediately before/after Clippy copies an item

The prototype does not need sophisticated error UI.

The purpose is to discover technical problems.

---

# 16. UX Performance Test

This is one of the most important parts of the spike.

The application should **feel instantaneous**.

Evaluate this sequence manually:

```text
Global shortcut
     ↓
Window visible
     ↓
Search focused
     ↓
Type
     ↓
Results update
     ↓
Select
     ↓
Clipboard updated
     ↓
Window closes
```

Look specifically for:

- Visible startup delay
- WebView rendering delay
- Focus delay
- Search lag
- Tauri command/event latency
- Clipboard operation delay
- Window-close delay

Do not optimize based solely on measured milliseconds.

The primary evaluation is whether the interaction feels immediate.

---

# 17. Architecture Evaluation

After implementation, report whether Tauri creates any meaningful friction around:

- Windows clipboard APIs
- Clipboard monitoring
- Clipboard formats
- Global shortcuts
- Popup windows
- Window focus
- Window positioning
- Background execution
- System tray/background behavior
- Application startup
- Packaging
- Resource usage
- Rust ↔ TypeScript communication

For every issue discovered, classify it:

### Green

Straightforward.

### Yellow

Possible, but requires custom/native work or has some friction.

### Red

Significant problem or reason to reconsider Tauri.

---

# 18. What NOT to Build

Do not implement:

- Final Clippy visual design
- Final branding
- Animations
- Snippets
- Workspaces
- Smart previews
- Transformations
- Privacy exclusions
- Direct paste mode
- Complex settings UI
- User accounts
- Cloud synchronization
- Auto-update system
- Final installer
- Final database schema

Do not turn the spike into the full product.

The objective is **technical validation**, not feature completion.

---

# 19. Deliverables

At the end of the spike, provide:

## A. Working prototype

A Windows application demonstrating the required flow.

## B. Source code

Organized clearly enough that it can become the foundation of the actual project if the spike passes.

## C. README

Include:

- Prerequisites
- Development setup
- Build instructions
- How to run the prototype
- Known limitations
- Architecture overview

## D. Technical assessment

Provide a short report covering:

### Tauri

- Overall viability
- Windows integration
- Frontend experience
- Rust experience

### Performance

- Approximate startup behavior
- Approximate idle memory
- Approximate idle CPU
- Search responsiveness

### Clipboard

- Text
- Images
- Files
- Reliability
- Windows compatibility

### Windowing

- Popup behavior
- Focus behavior
- Global shortcut
- Close behavior

### Recommendation

Choose one:

```text
GO
```

Tauri is suitable for building Clippy.

```text
GO WITH CAVEATS
```

Tauri is suitable, but specific issues need to be addressed.

```text
NO-GO
```

Tauri introduces significant problems for Clippy and another technology should be evaluated.

If choosing GO WITH CAVEATS or NO-GO, clearly explain why.

---

# 20. Success Criteria

The spike is successful if:

1. Tauri can reliably monitor the Windows clipboard.
2. Text, images, and files can be detected.
3. Clipboard history can be displayed.
4. Search feels instantaneous.
5. A historical item can be placed back onto the Windows clipboard.
6. Normal Windows paste works afterward.
7. The application can operate in the background.
8. A global shortcut can summon the UI.
9. The popup can receive focus reliably.
10. The application feels lightweight and responsive.
11. No major Tauri/Windows integration issue is discovered.
12. The Rust ↔ frontend boundary feels manageable for the eventual application.

The most important success criterion is **not feature completeness**.

It is:

> **Can Tauri support a fast, minimal, polished Windows clipboard experience without fighting the platform?**

If yes, Tauri becomes the assumed technology for the actual Clippy MVP.
