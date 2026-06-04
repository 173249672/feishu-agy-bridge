# Session Management & Settings Design Doc

## Overview
This design document details the enhancement of the session management commands (`/list`, `/switch`, `/stop`, `/del`) and the addition of the `/settings` configuration command supporting multi-language (Chinese/English) translations, card theme templates, and wide-screen layout overrides.

## Goals
- Modify `/stop` to only terminate the running agy process, preserving the session metadata in the registry list.
- Modify `/list` to return 1-based index numbers sorted by `startTime` (ascending), with visual indicators for process running states (`🟢` vs `⚪`).
- Support index-based lookup in `/switch`, `/stop`, and `/del` commands.
- Implement `/del <idx or session-id>` and `/del all` to stop running processes, delete their physical session files on disk from the agy directories, and completely remove session metadata from the registry.
- Implement `/settings` to display an interactive configuration menu in Feishu, permitting users to visually configure language, card styling preset themes, and wide-screen layout overrides.

## Components and Architecture

### Index Resolution
A helper function `resolveSession` will translate a string parameter into a session:
1. Try parsing the argument as an integer.
2. If it is a valid 1-based index within the list of sorted sessions (sorted by `startTime` ascending), retrieve the session at that index.
3. Otherwise, look up the session by its exact UUID from the registry.

### Settings Manager (`src/settings-manager.js`)
Manages disk persistence for bridge configurations (`language`, `theme`, `wideScreen`) to `bridge-settings.json` in the brain directory, loading them on startup and writing updates asynchronously.

### Translation Manager (`src/i18n.js`)
Maps all bridge message strings, button labels, card headers, and error updates into two localized dictionaries (Chinese `zh` and English `en`). Exposes `t(key, ...args)` for dynamic translations.

### Card Builder styling updates (`src/card-builder.js`)
- Headers of permission, error, question, status, and completed cards are dynamically styled using the configured preset theme color (`blue`, `orange`, `violet`, `grey`) unless using the default multi-color templates.
- Configures `wide_screen_mode` across all generated cards based on the widescreen setting.
- Provides `buildSettingsCard()` to draw the interactive settings configuration menu card.

## Verification Plan

### Automated tests
We will verify settings, card builders, and command dispatchers via:
- `tests/settings.test.js`: Checks settings manager loading/saving and translation returns in Chinese and English.
- `tests/card-builder.test.js`: Checks card builder rendering, theme templates override, wide-screen mode override, and settings card generation.
- `tests/index.test.js`: Asserts settings card callback handlers, list, switch, stop, and del behaviors under index execution.
