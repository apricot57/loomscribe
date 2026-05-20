# 🗺️ Implementation Plan: Material Expressive Redesign

We will completely overhaul VibeChat's interface from a rigid Cyberpunk/Neon Green theme to a friendly, premium, and highly tactile **Material Design Expressive (Material 3)** system. 

The design will be built on organic shapes, pill contours, a rich expressive color system (deep lavender, vibrant orchid, and peach accents), and elegant transitions.

---

## 🎨 Visual Design & Tonal System

We will establish a modern Material 3 Tonal Color Palette based on an expressive violet dynamic scheme:

```css
:root {
    /* M3 Expressive Tonal Palette (Dark Theme) */
    --md-sys-color-background: #0f0b16;          /* Deep royal obsidian black with warm violet undertone */
    --md-sys-color-surface: #171220;             /* Elevated base card surface */
    --md-sys-color-surface-container: #211c2b;   /* Mid elevated surface */
    --md-sys-color-surface-container-high: #2b2537; /* High elevated surface (input/dropdown) */
    
    --md-sys-color-primary: #b18cff;             /* Pastel lavender primary brand color */
    --md-sys-color-primary-container: #49287a;   /* Rich purple container block */
    --md-sys-color-on-primary-container: #eaddff; /* High contrast text on purple */
    
    --md-sys-color-secondary: #f48fb1;           /* Warm rose/orchid accent */
    --md-sys-color-secondary-container: #5d1039; /* Deep berry secondary block */
    
    --md-sys-color-tertiary: #ffd59a;            /* Warm peach highlight */
    --md-sys-color-on-tertiary: #4a2800;
    
    --md-sys-color-outline: rgba(255, 255, 255, 0.12); /* Subtle card separator */
    --md-sys-color-outline-variant: rgba(177, 140, 255, 0.25); /* Glowing lavender outline focus */
    
    --md-sys-color-text-primary: #e6e1e9;        /* Soft lilac-white text */
    --md-sys-color-text-secondary: #9c95a6;      /* Muted lavender-grey text */
    
    /* Shapes & Elevations */
    --md-shape-corner-full: 9999px;              /* Perfect pill shapes for buttons, badges, selectors */
    --md-shape-corner-extra-large: 28px;        /* Organic rounded shapes for card surfaces, inputs, modals */
    --md-shape-corner-medium: 16px;             /* Standard bubble rounds */
}
```

---

## 🛠️ Proposed Changes

### 1. Typography & Header Overhaul
#### [MODIFY] [index.html](file:///c:/Users/Focus/Documents/Misc/vibe-api/index.html)
*   **Google Fonts**: Swap `Inter` for **Outfit**, an extremely friendly, modern, and expressive sans-serif font that makes the interface look highly tailored.
*   **M3 Navigation Drawer (Sidebar)**:
    *   Transform the left sidebar into a standard M3 rounded drawer (`border-radius: 0 var(--md-shape-corner-extra-large) var(--md-shape-corner-extra-large) 0`).
    *   Turn "New Chat" into an M3 **Floating Action Button (FAB)** with a playful, heavily rounded squircle shape (`border-radius: 20px`) and deep lavender backgrounds.
*   **Tactile Top Header**: Keep a lightweight header displaying "VibeChat" with large, expressive bold typography.

### 2. Layout, Cards, & Input Repositioning
#### [MODIFY] [style.css](file:///c:/Users/Focus/Documents/Misc/vibe-api/style.css)
*   **Expressive Chat Bubbles**:
    *   *User Messages*: Rounded sleek bubbles in primary lavender container (`--md-sys-color-primary-container`), aligned right, with fully rounded curves except a unique sharp anchor on the tail.
    *   *Bot Messages*: Housed in custom, elevated, elegant cards with double-border borders and soft violet gradients.
*   **Pill-Shaped Bottom Input**:
    *   Transform `#chat-form` into a giant, cozy pill-shaped input container (`border-radius: 32px`) floating centered at the bottom.
    *   Restyle `#send-btn` into a primary colored button with tactile hover scale states.
*   **Floating Model Selector**:
    *   Keep the selector near the chatbox but style it as a cute Material 3 Pill Button (`border-radius: 9999px`) with an elegant chevron icon and subtle elevated shadows.
    *   Style the popped-up menu with organic corners (`border-radius: 20px`) and glassmorphic elevated depth.

### 3. Logic & Behavior Sync
#### [MODIFY] [app.js](file:///c:/Users/Focus/Documents/Misc/vibe-api/app.js)
*   Adjust default message icons or classes if needed.
*   Keep the core state logic (Local Storage API key saving, model state toggling, and asynchronous DeepSeek V4 payloads) fully intact.

### 4. Custom M3 Favicon Asset
#### [NEW] [favicon.png](file:///c:/Users/Focus/Documents/Misc/vibe-api/favicon.png)
*   Generate an expressive, abstract geometric AI sphere utilizing the new Material 3 lavender, rose, and amber color palettes, perfectly matching the visual updates.

---

## 🔍 Verification Plan

### Manual Verification
1.  **Typography Check**: Verify that all headers, text inputs, and labels use the friendly **Outfit** sans-serif font face.
2.  **Tactile Shapes**: Inspect elements to verify the transition to heavy organic border-radii (`28px` for modal contents and sidebar edges, `9999px` for search/model pill buttons).
3.  **Color Harmony**: Review high-contrast visibility under the new Lavender & Berry expressive dark palette. Ensure warning panels, links, and buttons maintain excellent readability.
4.  **Responsive drawer transitions**: Verify sidebar animations slide out cleanly on mobile device widths.
