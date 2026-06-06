# Story Continuity Scaffolds Plan

## Goal

Add the smallest set of supporting scaffolds that improve long-form story quality in LoomScribe without turning the app into a full memory system or roleplay platform.

The problem to solve first is drift:

- earlier details get forgotten
- character voices flatten over time
- the model starts contradicting established facts
- long sessions lose their original premise

The solution should be simple and durable.

## Bare Minimum

The minimum useful scaffold is:

1. A rolling story summary
2. A small set of pinned continuity facts
3. Compact character reference snippets
4. Prompt assembly that always includes those pieces before recent chat history

If these work well, most long-session drift improves immediately.

## Core Pieces

### 1. Story Summary

Maintain a short summary of what has happened so far.

It should include only:

- current premise
- current scene
- unresolved goals
- important recent turns
- key continuity facts that matter right now

This summary should stay short enough to fit comfortably in context.

### 2. Pinned Continuity Facts

Let the user pin facts that must always be included.

Examples:

- character names
- relationships
- injuries
- important locations
- tone rules
- active promises or constraints

These are the facts the model should be least likely to forget.

### 3. Character Reference Snippets

Do not start with full character sheets.

Instead, keep a compact block for each important character:

- role in the story
- voice or speech style
- key traits
- current state
- important relationship notes

The goal is to preserve voice and behavior across a long session without adding a large editing burden.

## Prompt Order

When generating a response, the prompt should be assembled in this order:

1. System prompt card
2. Story summary
3. Pinned continuity facts
4. Character reference snippets
5. Recent conversation history
6. User message

This keeps the current prompt-card system intact while adding memory-like scaffolding around it.

## Data Model

Keep the stored data minimal and sensory_detailed.

Suggested records:

- `story_summary`
- `pinned_facts`
- `character_notes`

Suggested fields:

- `story_summary`: `conversationId`, `content`, `updatedAt`
- `pinned_facts`: `id`, `conversationId`, `label`, `content`, `status`, `createdAt`, `updatedAt`
- `character_notes`: `id`, `conversationId`, `name`, `content`, `status`, `createdAt`, `updatedAt`

Keep these separate from the chat transcript.

## UI Minimum

Expose the scaffolds in the simplest possible way:

- a `Story So Far` box
- a `Pinned Facts` section
- a `Character Notes` section

The UI should make it easy to:

- edit the summary manually
- pin a fact from a conversation
- add or edit a character note
- remove obsolete items

Do not add a large dashboard yet.

## Update Workflow

After each model response, support a lightweight review step:

- offer a suggested summary update
- optionally surface a suggested continuity fact
- let the user accept, edit, or ignore it

This can be manual at first. The important part is that the user has a place to keep continuity stable.

## What To Avoid

- full world info systems
- semantic retrieval
- branching canon management
- complex character-sheet databases
- roleplay-first UI patterns
- too many prompt knobs

Those can come later if the simple scaffolds prove useful.

## Implementation Order

1. Store a conversation-level story summary
2. Store pinned continuity facts
3. Store compact character notes
4. Inject them into prompt assembly
5. Add a small UI for editing them
6. Add optional suggested summary updates

## Success Criteria

This is working if:

- long sessions retain earlier facts more reliably
- characters keep their voice better
- the story premise stays stable
- the user does not have to micromanage the prompt
- the app still feels lightweight and prompt-card-first
