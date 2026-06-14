# LoomScribe Future Feature Roadmap & Story Continuity Plan

This document combines the implementation plan for **Story Continuity Scaffolds** and the **Near-Term/Longer-Term UI and Feature Roadmap**.

---

## 🎯 High-Level Goal

Enhance long-form story quality by preventing drift (forgetting details, loss of character voice, contradiction of facts) and expanding LoomScribe's UI to support user-managed context (world info, prompt cards, and character notes) without overloading the main chat interface.

---

## 🧩 Phase 1: Story Continuity Scaffolds (Core Implementation)

This phase aims to implement the minimal set of scaffolds that keep long sessions stable with minimal user micromanagement.

### 1. The Core Scaffolds

*   **Story Summary**: A rolling summary of the story so far (current premise, active scene, unresolved goals, and key recent developments). Must remain compact.
*   **Pinned Continuity Facts**: Critical facts (character relationships, location details, active constraints, or tone rules) that the model must not contradict.
*   **Character Notes**: Compact reference snippets detailing character roles, traits, voice/speech styles, and current states.

### 2. Suggested Data Model

These records should be stored in the database, mapped to the corresponding `conversationId`, but kept separate from the chat history transcript:

```json
{
  "story_summary": {
    "conversationId": "number",
    "content": "string",
    "updatedAt": "timestamp"
  },
  "pinned_facts": [
    {
      "id": "number",
      "conversationId": "number",
      "label": "string",
      "content": "string",
      "status": "active | archived",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ],
  "character_notes": [
    {
      "id": "number",
      "conversationId": "number",
      "name": "string",
      "content": "string",
      "status": "active | archived",
      "createdAt": "timestamp",
      "updatedAt": "timestamp"
    }
  ]
}
```

### 3. Prompt Assembly & Injection Order

When sending a generation request to the API, compile and inject the scaffolds immediately before the recent chat history. 

> [!NOTE]
> Changes to Slot 1 (System Prompt) invalidate the DeepSeek KV cache. Since the rolling summary changes frequently, placing the summary and notes into the context stream requires careful balancing.
> If injected into Slot 1, it busts the cache on every turn. Alternatively, they can be injected at the top of Slot 2 (Post-History) or structured as pinned messages.

**Proposed Prompt Assembly Order:**
1.  **System Prompt Card** (Slot 1 - Stable)
2.  **Story Summary**
3.  **Pinned Continuity Facts**
4.  **Character Reference Snippets**
5.  **Recent Conversation History**
6.  **User Message**

### 4. UI Integration (The Right Pane)

Rather than cluttering the left sidebar, the continuity scaffolds should live in the collapsible right-hand pane alongside the prompt settings:

*   **"Story So Far" Box**: Editable textarea displaying the rolling summary.
*   **"Pinned Facts" Section**: List of pinned facts with inline options to add, edit, or delete/archive.
*   **"Character Notes" Section**: List of active characters with fields for name and voice/traits.

### 5. Update & Review Workflow

To minimize manual user entry, run a lightweight post-generation step:
*   After each assistant response, suggest a potential update to the story summary.
*   Optionally, detect and suggest a new continuity fact to be pinned.
*   Provide a quick UI toast or inline prompt allowing the user to **Accept**, **Edit**, or **Ignore** the suggestion.

---

## 🗺️ Phase 2: World Info & Near-Term UI Expansion

Separate chat history from reusable world knowledge by introducing a structured reference system.

### 1. Near-Term UI Expansion Steps

1.  **Define World Info Data Model**: Define how world locations, items, lore, and faction info are stored.
2.  **Determine Scope**: Decide whether right-pane World Info items are **global** (available to all stories) or **conversation-specific**.
3.  **Integrate with Right Pane**: Place prompt cards and world info entries into tabs or collapsible sections in the right-hand panel.
4.  **Desktop-First Layout**: Maintain a 3-pane layout on desktop (`Left Sidebar (Navigation) | Center Pane (Active Chat) | Right Pane (Context/Settings)`), collapsing the right pane to a drawer/modal on mobile.

---

## 🚀 Phase 3: Advanced Features & Longer-Term Ideas

Once the core scaffolds and UI extensions are stable, introduce the following system features:

*   **Search**: Full-text search across prompt cards, character notes, and world info.
*   **Tagging and Filtering**: Allow users to tag reusable context (e.g., `#location`, `#magic-rules`, `#character-trait`) for quick organization.
*   **Context Pinning**: Pin global world info entries dynamically to specific conversations.
*   **Import/Export**: Support importing and exporting "context packs" (JSON or ZIP files containing custom world info, presets, and character sets).
*   **Versioning**: Save histories of world info entries to easily revert changes.
*   **Composable Prompts**: Implement block inheritance and modular imports for reusable prompt cards (allowing presets to reference parent/base styles).

---

## 🚫 What to Avoid

*   **Semantic Retrieval (RAG)**: Do not build automated embedding-based retrieval yet; stick to simple manual pinning and context injection.
*   **Branching Canon Management**: Keep the story line linear; do not add multi-universe canon splitting.
*   **Overcomplicated UI Dashboard**: Keep editing interfaces inline and simple. Do not build a massive database dashboard.
