# 🌌 VibeChat — DeepSeek AI Chatbot

A lightweight, visually gorgeous, and responsive vanilla HTML/CSS/JS frontend for chatting with the DeepSeek API. No heavy frameworks, no build steps—just pure modern vibes.

![VibeChat Header](https://raw.githubusercontent.com/google/material-design-icons/master/png/action/visibility/white/2x/elg_visibility_white_48dp.png) *(Placeholder image representing clean interface)*

## ✨ Features

- **Premium Glassmorphism UI**: High-fidelity dark mode styling using vibrant gradients (`#0f172a` to `#1e1b4b`), subtle borders, blur backdrops, and harmonious color palettes.
- **Vanilla Stack**: Absolute zero dependencies. Built purely on semantic HTML5, modern CSS3 variables, and vanilla JavaScript.
- **DeepSeek Integration**: Straightforward direct connection to the DeepSeek API (`deepseek-chat` model).
- **Persistent Chat History**: Dynamically saves and loads conversation logs from the browser's `localStorage` so you never lose your thread on refresh.
- **Interactive Micro-Animations**: Smooth message slide/fade-ins, pulsing three-dot typing indicators, and tactile submit button state transitions.
- **Responsive Layout**: Fluid flexbox system optimized perfectly for mobile screens (full height) and desktop displays (centered premium floating card at `90vh`).

## 🚀 Getting Started

To get the running locally:

### 1. Clone or Download the Files
Ensure you have the following files in the same directory:
- `index.html`
- `style.css`
- `app.js`

### 2. Configure the API Key
Open [app.js](file:///c:/Users/Focus/Documents/Misc/vibe-api/app.js) in your editor, locate line 8, and replace the placeholder value with your actual DeepSeek API Key:
```javascript
const API_KEY = 'YOUR_DEEPSEEK_API_KEY';
```

> [!CAUTION]
> **Security Warning**: Storing API keys in client-side code exposes them to anyone visiting/inspecting your webpage. Ensure this is only run in private, trusted, or local environments. For production use, a secure backend proxy server must be deployed to hide the key.

### 3. Launch the Application
Simply open `index.html` in any modern web browser (Double-click the file, or use a local dev server extension like Live Server in VS Code).

## 🛠️ Project Structure

```
vibe-api/
├── index.html           # Main semantic structure and page elements
├── style.css            # Layout, colors, animations, glassmorphism, responsive styles
├── app.js               # Event handlers, state management, storage, and API fetch logic
└── README.md            # Project documentation and developer instructions
```

## 🔮 Future Roadmap

- [ ] **Secure Proxy Backend**: Shift API calls from the client-side to a lightweight Node.js/Express server to secure credentials.
- [ ] **Markdown & Code Highlight**: Add `marked.js` or equivalent to properly format headers, lists, and code blocks from DeepSeek.
- [ ] **Chat Settings**: Add a sidebar/dropdown to adjust temperature, configure custom system instructions, or toggle the model between `deepseek-chat` and `deepseek-coder`.
- [ ] **Export & Clear Features**: Provide options to download chat transcripts (JSON/Markdown) or clear the session history directly from the UI.

