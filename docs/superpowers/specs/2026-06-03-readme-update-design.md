# README Documentation Update Design Spec

**Date:** 2026-06-03
**Goal:** Update `README.md` and `README.zh-CN.md` to document the dynamic option selection for permission cards via PTY arrow navigation.

## Proposed Changes

### 1. English README (`README.md`)

- **Features**: Update "Two-way Communication" to mention the PTY arrow navigation when selecting multi-choice permissions.
- **Event Cards**: Update "Permission Request" row to mention dynamic choice buttons.

### 2. Chinese README (`README.zh-CN.md`)

- **Features** (功能特性): Update "双向交互注入" (Two-way communication) to mention parsing options and simulating arrow keys via PTY.
- **Event Cards** (事件卡片类型): Update "权限请求" (Permission Request) row to mention dynamic configuration buttons.

## Verification Plan

- Inspect `git diff` to ensure precise formatting and translations.
- Check both files for correct Markdown rendering.
