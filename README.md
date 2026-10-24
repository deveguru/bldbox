<p align="center">
  <a href="https://bldbox.ir"><img src=".github/hero.svg" alt="BldBox — AI Workshop" width="100%"></a>
</p>

<p align="center">
  <a href="https://bldbox.ir"><img src="https://img.shields.io/badge/LIVE-bldbox.ir-9B30FF?style=for-the-badge&labelColor=0A0A10" alt="bldbox.ir"></a>
  <img src="https://img.shields.io/badge/UI-RTL%20first-7A00F0?style=for-the-badge&labelColor=0A0A10" alt="RTL">
  <img src="https://img.shields.io/badge/font-Vazirmatn-00B7D8?style=for-the-badge&labelColor=0A0A10" alt="Vazirmatn">
  <img src="https://img.shields.io/badge/theme-dark%20neon-ED1908?style=for-the-badge&labelColor=0A0A10" alt="dark neon">
</p>

<br>

<p align="center">
  <a href="https://bldbox.ir"><img src=".github/features.svg" alt="Features" width="100%"></a>
</p>

<br>

<p align="center">
  <a href="https://bldbox.ir/code"><img src=".github/code.svg" alt="BldBox Code" width="100%"></a>
</p>

<br>

## Frontend

This repository holds the **BldBox web frontend** — Jinja2 templates, stylesheets and browser
scripts. Server code, the admin panel, payments and configuration are not part of it.

```text
templates/
  base.html            shared <head>, theme, i18n strings
  chat.html            home page: ChatGPT-style chat, guest mode, voice, web search
  _sidebar.html        tools + chat history + account menu
  _login_modal.html    phone sign-in (OTP)
  code.html            BldBox Code: build apps from a prompt, live preview, ZIP export
  login.html  pricing.html  account.html  profile.html  payment_result.html  _plan_cards.html
static/
  css/app.css          brand palette, components, neon scrollbars, code boxes
  css/shell.css        app shell: sidebar, centred composer, RTL/LTR message layout
  css/code.css         BldBox Code workspace
  js/chat.js           streaming answers, guest store (localStorage), live dictation,
                       silence auto-send, voice conversation, file previews
  js/code.js           project files, sandboxed preview, code viewer
  js/shell.js          sidebar drawer, sign-in modal, guest gating
  js/app.js            Markdown, per-paragraph direction, syntax highlighting, copy/download
  fonts/  vendor/      Vazirmatn · marked · DOMPurify · highlight.js
```

| Palette | | | | | |
|:-:|:-:|:-:|:-:|:-:|:-:|
| ![](https://img.shields.io/badge/-%237A00F0-7A00F0?style=flat-square) | ![](https://img.shields.io/badge/-%239B30FF-9B30FF?style=flat-square) | ![](https://img.shields.io/badge/-%23B266FF-B266FF?style=flat-square) | ![](https://img.shields.io/badge/-%2300E5FF-00B7D8?style=flat-square) | ![](https://img.shields.io/badge/-%23ED1908-ED1908?style=flat-square) | ![](https://img.shields.io/badge/-%23050508-050508?style=flat-square) |

<br>

<p align="center">
  <a href="https://bldbox.ir">
    <img src="https://img.shields.io/badge/%E2%86%92%20%20Open%20BldBox-bldbox.ir-9B30FF?style=for-the-badge&labelColor=ED1908" alt="Open bldbox.ir" height="46">
  </a>
</p>
<p align="center"><a href="https://bldbox.ir"><b>https://bldbox.ir</b></a></p>

<p align="center"><sub>Vazirmatn by Saber Rastikerdar (OFL) · marked (MIT) · DOMPurify (Apache-2.0/MPL-2.0) · highlight.js (BSD-3)</sub></p>
