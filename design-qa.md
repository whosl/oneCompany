# Design QA

- Source visual truth:
  - `/var/folders/rv/5_lp5d250tq7rwyn8rx0zt200000gn/T/codex-clipboard-cb582d7e-e0ef-476a-9cd0-8969f525138f.png`
  - `/var/folders/rv/5_lp5d250tq7rwyn8rx0zt200000gn/T/codex-clipboard-3bbb9301-5b58-4e77-b9c3-a77dcbbd933b.png`
  - `/var/folders/rv/5_lp5d250tq7rwyn8rx0zt200000gn/T/codex-clipboard-60a9e4c0-195c-4b0a-acaa-b284cd09dfae.png`
  - `/var/folders/rv/5_lp5d250tq7rwyn8rx0zt200000gn/T/codex-clipboard-a7d48855-fd5f-47e7-94b5-cb86a5159050.png`
- Implementation screenshot: `/tmp/onecompany-webui-stream-after.png`
- Viewport: desktop 1280 x 720; responsive verification 390 x 844
- State: project console, dark theme, Developing, artifact/file inspector exercised

## Full-view comparison evidence

The original three-column TUI2 composition, terminal typography, lifecycle bar, Agent hierarchy, Inspector proportions, and composer position are preserved. The requested hierarchy changes are visible without changing the surrounding visual system: Markdown is structured, tool activity is collapsed into muted batches, and the file panel uses directory rows.

## Focused region comparison evidence

- Information stream: browser DOM contained 46 Markdown headings and 23 GFM tables; visual inspection confirmed headings, lists, code, blockquotes, and tables use the existing terminal tokens.
- Markdown viewer: both `artifacts/.../prd-latest.md` and repository `RUN.md` rendered through the same Markdown surface. The artifact contained 11 headings; `RUN.md` contained 4 headings.
- Files panel: `client` collapsed to zero nested rows and expanded to one visible `client/src` directory. Mobile showed 17 visible tree rows with no horizontal overflow.
- Tool activity: 37 consecutive tool batches replaced 203 individually prominent tool rows. Individual calls and outputs remain available on expansion.
- User messages: persisted `taizi.routed.message` values now render as user turns; newly submitted messages also receive an immediate local sending state until the matching server event arrives.

## Required fidelity surfaces

- Fonts and typography: existing monospace UI remains unchanged; Markdown hierarchy is intentionally restrained to 1.05-1.35em so it does not become document-like chrome inside the stream.
- Spacing and layout rhythm: no grid or panel proportions changed. Collapsed tool batches reduce vertical noise while retaining the original stream rhythm.
- Colors and visual tokens: all new states use existing cyan, green, yellow, red, line, surface, and muted tokens.
- Image quality and asset fidelity: no raster or decorative assets were introduced; existing Lucide UI icons are retained.
- Copy and content: source content is preserved. Markdown line breaks are no longer flattened, so headings, tables, lists, and code retain their authored meaning.

## Findings

No actionable P0, P1, or P2 mismatches remain for the requested changes.

## Patches made

- Added shared GFM Markdown rendering for the stream and file viewer.
- Preserved Markdown line breaks during event normalization.
- Added collapsible hierarchical repository navigation.
- Added historical and optimistic user-message rendering.
- Grouped consecutive tool calls into compact expandable batches.

final result: passed
