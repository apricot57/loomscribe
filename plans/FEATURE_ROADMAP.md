# LoomScribe Feature Roadmap

This file is for feature and functionality ideas, not technical refactor work.
Use the technical planning doc for implementation cleanup and architecture
changes.

Related plans:

- [`story_continuity_scaffolds_plan.md`](story_continuity_scaffolds_plan.md)
- [`composable_prompt_system_plan.md`](composable_prompt_system_plan.md)

## Near-Term UI Expansion

- Add a collapsible right-hand pane for reusable context.
- Keep the left sidebar focused on conversation navigation.
- Use the center pane for the active chat only.
- Make the right pane desktop-first and collapse it into a drawer or modal on
  smaller screens.

### Right Pane Contents

- Prompt cards.
- World info entries.
- Character sheets.
- Notes or reference snippets.
- Optional assets or imported context.

### Why This Makes Sense

- It separates chat history from reusable knowledge.
- It scales better than continuing to pack everything into the left sidebar.
- It gives world info a natural home as user-managed context rather than as a
  chat-history artifact.
- It makes future tools easier to discover without polluting the main chat flow.

## Suggested Next Steps

1. Define the data model for world info.
2. Decide whether right-pane content is global or conversation-specific.
3. Add a collapsed desktop shell for the right pane.
4. Move prompt cards into that shell first.
5. Add world info after the navigation and rendering patterns are stable.

## Longer-Term Ideas

- Search across prompt cards and world info.
- Tagging and filtering for reusable context.
- Pinning important entries to a conversation.
- Import/export for context packs.
- Versioning for world info entries.
- Composable prompt modules and inheritance for reusable prompt cards.
- Story continuity scaffolds for summaries, pinned facts, and character notes.

## Notes

- This roadmap should stay high-level until the right-pane shell exists.
- Avoid mixing new context libraries into the conversation list.
- Keep mobile behavior simple: collapse the right pane rather than squeezing it
  into the main layout.
