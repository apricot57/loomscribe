# Composable Prompt System Plan

## Goal

Replace the current one-file-one-prompt approach with a composable prompt system built from reusable modules, inheritance, and a prompt compiler.

The objective is not to change the app into a different product. The objective is to remove repetition from the existing prompt-card workflow and make it easier to build stronger story-writing prompts from shared parts.

## Why This Is Needed

The current prompt cards already share a lot of structure:

- identity or role definition
- core behavior
- storytelling principles
- tone and prose rules
- output formatting
- hard constraints

That means the cards are already acting like a primitive module system, just manually duplicated in separate files.

## Core Idea

Treat prompt cards as compositions of smaller parts.

Instead of:

- one file = one complete prompt

Move to:

- shared modules + scenario-specific modules + output contract

The system should assemble a final prompt from reusable building blocks.

## Composition Layers

Define a small set of standard layers:

### Base Layers

- writer identity
- continuity rules
- no-meta rules
- long-form response rules
- baseline prose rules

### Style Layers

- grounded prose
- literary dark fiction
- fast-paced scene writing
- sensory detail emphasis
- dialogue-heavy writing

### Scenario Layers

- corruption arc
- world premise generation
- betrayal
- power dynamics
- scene continuation

### Output Layers

- target word count
- no headers
- no preamble
- numbered list output
- scene-only output

### Constraint Layers

- maintain continuity
- no summaries unless requested
- no filler
- no self-commentary
- follow user direction

## File Model

Use a modular prompt structure rather than a single flat prompt file.

Suggested structure:

```text
prompt_cards/
  modules/
    base/
    style/
    output/
    constraints/
    scenarios/
  cards/
```

Use Markdown files with YAML front matter as the source format. That keeps the files editable by hand while still giving the compiler structure.

## Module File Format

### Metadata

Each module should start with front matter:

```md
---
id: base_writer
type: base
title: Base Writer
description: Core writing behavior shared by most prompt cards.
tags:
  - continuity
  - prose
  - behavior
extends: []
overrides: []
rule_ids:
  - base_writer_identity
---

# Base Writer

You are a skilled fiction writer...
```

Recommended metadata fields:

- `id`: stable unique identifier
- `type`: `base`, `style`, `scenario`, `output`, or `constraint`
- `title`: human-readable name
- `description`: short summary for UI browsing
- `tags`: search and filtering labels
- `extends`: list of parent module IDs
- `overrides`: list of rule IDs this module replaces
- `rule_ids`: stable IDs for the rules inside the body

### Body

The body should contain the actual instructions in Markdown.

Use the body for:

- the rules themselves
- bullet lists
- examples
- clarifying notes

Keep each module tightly scoped. One module should do one job well.

### Card Shape

A card is a module composition definition, not necessarily a full prompt text blob.

Example:

```json
{
  "id": "corruption_moral_decline",
  "title": "Corruption & Moral Decline",
  "extends": [
    "base_writer",
    "continuity",
    "longform",
    "grounded_prose"
  ],
  "adds": [
    "corruption_arc",
    "psychological_decline"
  ],
  "output": {
    "target_words": 1500,
    "no_headers": true
  }
}
```

The rendered Markdown can still be produced for readability, but the source of truth should be compositional.

### Module Categories

Keep categories narrow and predictable:

- `base`: general writer behavior
- `style`: voice and prose choices
- `scenario`: scenario-specific writing behavior
- `output`: formatting and length requirements
- `constraint`: hard rules and prohibitions

### Inheritance Rules

- inheritance is sensory_detailed
- modules only inherit from modules listed in `extends`
- inheritance resolves from base to leaf
- later modules can override earlier ones
- circular references are invalid
- a module should not depend on hidden global state

### Merge Rules

When compiling:

- concatenate unique instruction blocks in inheritance order
- deduplicate exact repeated rule IDs
- apply sensory_detailed overrides over inherited content
- keep the output contract at the end of the compiled prompt
- preserve module order unless an override changes it

### Example Layout

```text
prompt_cards/
  modules/
    base/
      base_writer.md
      continuity.md
      longform.md
    style/
      grounded_prose.md
      literary_dark.md
    constraints/
      no_meta.md
      maintain_continuity.md
    scenarios/
      corruption_arc.md
      world_premise_generator.md
  cards/
    general_sensory_fiction.json
    corruption_moral_decline.json
```

## Compiler Responsibilities

Add a prompt compiler that:

1. loads the selected card
2. resolves all inherited modules
3. merges duplicated rules
4. applies overrides
5. renders the final prompt text
6. shows a preview of the compiled result

Compiler rules:

- base modules load first
- scenario modules layer on top
- output contract comes after behavior and style
- overrides replace, not append
- duplicate instructions should be deduplicated where possible

## Prompt Authoring Rules

Prompt authors should write modules, not giant monoliths.

Modules should be:

- small
- reusable
- narrowly scoped
- easy to combine
- easy to preview

Avoid putting unrelated behavior into the same module.

## Migration Strategy

Do not rewrite every existing prompt card at once.

Start by extracting the repeated material into shared base modules:

- fictional assumption
- continuity
- no-meta commentary
- long-form response rules
- sensory prose rules

Then update the existing cards to reference those shared modules and keep only the scenario-specific parts inline.

## UI Requirements

The UI should expose:

- module browser
- card editor
- inheritance view
- compiled prompt preview
- module usage reference

The user should be able to see:

- what a card includes
- what it overrides
- what the final compiled prompt will look like

## Validation Rules

The compiler should detect:

- missing module references
- circular inheritance
- repeated conflicting rules
- malformed output contracts

If there is a conflict, prefer sensory_detailed overrides and show the conflict in the preview.

## Relation To Existing Prompt Cards

The current Markdown cards can remain as the human-readable surface.

The difference is that they should no longer be the only structure.

The new model should let the app express:

- shared base behavior once
- style once
- scenario-specific logic once
- output contract once

## Implementation Order

1. Define the modular file format
2. Add a compiler that can resolve modules
3. Add a preview of the compiled prompt
4. Extract shared base modules from existing cards
5. Update the cards to reference the modules
6. Add override and validation support
7. Add UI for module browsing and card composition

## Success Criteria

This is working if:

- shared prompt text stops being duplicated across cards
- new cards can be assembled from existing modules quickly
- the compiled prompt can be inspected before use
- editing one base module improves many cards at once
- the prompt-card workflow stays familiar while becoming more powerful
