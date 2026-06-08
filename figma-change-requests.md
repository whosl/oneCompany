# OneCompany Console — Figma Change Requests

Handoff for applying the design fixes from the spec/UX review. Each item has the rationale, the exact target nodes (current → new), and a ready-to-run `use_figma` script.

## How to run

- File: `OneCompany Console - Claude Style Draft`
- `fileKey`: `r1RF1q4KzBEQHLBWVhGD0X`
- Page: `0:1` (`Console Draft - Claude Style`)
- Each script below is the `code` argument for the `use_figma` MCP tool (pass `fileKey` separately, and `skillNames: "figma-use"`).
- `use_figma` is **atomic** — a failed script changes nothing; fix and re-run.
- All text is **Inter** (`Regular` / `Medium` / `Semi Bold` / `Bold`). Every script loads fonts first (required before editing `characters`).
- After each script, take a `get_screenshot` of the affected frame to verify.

## Frames

| Frame | Node ID |
| --- | --- |
| Stream Mode | `2:2` |
| Swimlane Mode | `2:158` |
| Settings Modal | `6:2` |
| Project Hub Modal | `9:2` |
| Style Tokens | `2:373` |

## Palette (Claude-style tokens)

| Token | Hex | rgb (0–1) |
| --- | --- | --- |
| Ink | `#2B2118` | `{r:0.169,g:0.129,b:0.094}` |
| Body | `#3B3026` | `{r:0.231,g:0.188,b:0.149}` |
| Muted | `#7C6F62` | `{r:0.486,g:0.435,b:0.384}` |
| Accent (copper) | `#C86F3D` | `{r:0.784,g:0.435,b:0.239}` |
| Accent dark | `#9E4F2A` | `{r:0.620,g:0.310,b:0.165}` |
| Success | `#31785F` | `{r:0.192,g:0.471,b:0.373}` |
| Success soft | `#DCEBDF` | `{r:0.863,g:0.922,b:0.875}` |
| Warning | `#A96921` | `{r:0.663,g:0.412,b:0.129}` |
| Warm border | `#D7C5B2` | `{r:0.843,g:0.773,b:0.698}` |
| Surface | `#FFFDF8` | `{r:1,g:0.992,b:0.973}` |
| Track | `#F2E8DC` | `{r:0.949,g:0.910,b:0.863}` |

## Recommended run order

A → B → D → E (one script), then C, then F. Screenshot `2:2` after A–E and `9:2` after F.

---

## A. Top-nav state coherence (Stream + Swimlane)

**Why:** the header shows `Developing` + `Requirement Group` + `Completeness 78%` together, which is contradictory — during development the active group should be the Development Group, and completeness is a requirement-phase metric. Make the header reflect a single coherent state.

| Node | Name | Current | New |
| --- | --- | --- | --- |
| `2:17` | Status Label / Requirement Group (Stream) | `Requirement Group` | `Development Group` |
| `2:173` | Status Label / Requirement Group (Swimlane) | `Requirement Group` | `Development Group` |
| `2:20` | Status Label / Completeness 78% (Stream) | `Completeness 78%` | `Slice 2 / 3` |
| `2:176` | Status Label / Completeness 78% (Swimlane) | `Completeness 78%` | `Slice 2 / 3` |

## B. Requirement summary card — lock score + normalize text + settle gap chip

**Why:** if we are developing, the requirement score is final (not an in-progress 78%), and an open gap chip (`缺少角色权限`) shouldn't still be raised. Lock the score, normalize the summary wording, and turn the gap into a settled (green) fact.

| Node | Name | Current | New |
| --- | --- | --- | --- |
| `2:38` | Score Number | `78` | `92` |
| `2:41` | Progress / value | width `418.08` | width `493.12` (≈92%) |
| `2:37` | Requirement Text | `做一个可部署的任务看板 Web App，支持项目、任务、状态流转和验收报告。` | `任务看板 Web App：管理项目 / 任务 / 状态流转，并生成验收报告。` |
| `2:42` | Chip / 缺少角色权限 (bg) | Warning soft + warning stroke | Success soft `#DCEBDF` + Success stroke `#31785F` |
| `2:43` | Chip Label / 缺少角色权限 | `缺少角色权限` (warning) | `角色权限已定` (Success `#31785F`) |

> Leave chip `需要部署确认` (`2:44/2:45`, copper = upcoming action) and `TDD 已启用` (`2:46/2:47`, green = settled setting) as-is. Result: two settled (green) + one upcoming (copper), consistent semantics.

## D. De-duplicate requirement text (raw vs normalized)

**Why:** the top summary card and the `You · initial requirement` card render almost the same sentence. After B the summary becomes the *normalized* requirement; relabel the user card so it clearly reads as the *raw original*.

| Node | Name | Current | New |
| --- | --- | --- | --- |
| `13:5` | User Event Label | `You · initial requirement` | `You · 初始需求（原文）` |
| `13:6` | User Requirement Text | `做一个内部任务看板 Web App，支持项目、任务、状态流转和验收报告。` | keep (raw original) |

## E. Composer hint encodes gate policy

**Why:** make explicit that the composer never bypasses an open gate (spec §14.3 / §14.3.1).

| Node | Name | Current | New |
| --- | --- | --- | --- |
| `13:20` | Composer Hint | `补充需求、回答追问，或输入验收意见` | `回答追问 / 补充需求 / 验收意见 · gate 阻塞时仅对当前 gate 的允许选项生效` |

### Script for A + B + D + E

```js
const fonts=[{family:'Inter',style:'Regular'},{family:'Inter',style:'Medium'},{family:'Inter',style:'Semi Bold'},{family:'Inter',style:'Bold'}];
for(const f of fonts) await figma.loadFontAsync(f);
const byId=async(id)=>await figma.getNodeByIdAsync(id);
const green={r:0.192,g:0.471,b:0.373}, greenBg={r:0.863,g:0.922,b:0.875};
const touched=[];
const setText=async(id,chars)=>{const n=await byId(id); n.characters=chars; touched.push(id); return n;};
// A — top-nav coherence (Stream + Swimlane)
await setText('2:17','Development Group');
await setText('2:20','Slice 2 / 3');
await setText('2:173','Development Group');
await setText('2:176','Slice 2 / 3');
// B — requirement summary
await setText('2:38','92');
const prog=await byId('2:41'); prog.resize(493.12, prog.height); touched.push('2:41');
await setText('2:37','任务看板 Web App：管理项目 / 任务 / 状态流转，并生成验收报告。');
const chip=await byId('2:42'); chip.fills=[{type:'SOLID',color:greenBg}]; chip.strokes=[{type:'SOLID',color:green}]; touched.push('2:42');
const chipLbl=await byId('2:43'); chipLbl.fills=[{type:'SOLID',color:green}]; chipLbl.characters='角色权限已定'; touched.push('2:43');
// D — differentiate raw user input
await setText('13:5','You · 初始需求（原文）');
// E — composer gate-policy hint
const hint=await byId('13:20'); hint.textAutoResize='WIDTH_AND_HEIGHT'; hint.characters='回答追问 / 补充需求 / 验收意见 · gate 阻塞时仅对当前 gate 的允许选项生效'; touched.push('13:20');
return {touched};
```

---

## C. Resolve the requirement-confirm gate card to a historical state

**Why:** an *open, actionable* `需求确认` gate (Approve / Revise / Reject + input) sitting above active Coding/QA events is contradictory. Once development has started, this gate is in the past — render it as a resolved historical card (decision + actor + time) with only an audit action. This also removes the gate's "two action paths" (inline buttons vs composer).

| Node | Name | Action |
| --- | --- | --- |
| `2:58` | Gate Eyebrow | text → `HUMAN GATE · RESOLVED` |
| `2:60` | Gate Copy | text → `PRD 与验收标准已确认。你点击了 Approve，开发组已开始按切片实现。` |
| `2:61` | Button / Approve (rect) | → "approved" chip: fill Success soft, stroke Success, resize to `200 × 34` |
| `2:62` | Button Label / Approve | text → `✓ 已通过 · 你 · 2 分钟前`, fill Success, hug width |
| `2:63` | Button / Revise (rect) | → ghost audit button: move to `x=234`, resize `120 × 34` (keep warm surface + warm border) |
| `2:64` | Button Label / Revise | text → `查看决策日志`, move to `x=246` |
| `2:65`,`2:66` | Button / Reject + label | `visible = false` |
| `2:67`,`2:68` | Custom Input + placeholder | `visible = false` |

> Keep the `需求确认` title (`2:59`) and the card frame (`2:57`) as-is. The empty lower area is acceptable; do not resize the frame (siblings are absolutely positioned, shrinking would leave a gap).

### Script for C

```js
const fonts=[{family:'Inter',style:'Regular'},{family:'Inter',style:'Medium'},{family:'Inter',style:'Semi Bold'},{family:'Inter',style:'Bold'}];
for(const f of fonts) await figma.loadFontAsync(f);
const byId=async(id)=>await figma.getNodeByIdAsync(id);
const green={r:0.192,g:0.471,b:0.373}, greenBg={r:0.863,g:0.922,b:0.875};
const touched=[];
// eyebrow + copy
(await byId('2:58')).characters='HUMAN GATE · RESOLVED'; touched.push('2:58');
(await byId('2:60')).characters='PRD 与验收标准已确认。你点击了 Approve，开发组已开始按切片实现。'; touched.push('2:60');
// Approve button -> approved chip
const ap=await byId('2:61'); ap.fills=[{type:'SOLID',color:greenBg}]; ap.strokes=[{type:'SOLID',color:green}]; ap.resize(200,34); touched.push('2:61');
const apl=await byId('2:62'); apl.textAutoResize='WIDTH_AND_HEIGHT'; apl.fills=[{type:'SOLID',color:green}]; apl.characters='✓ 已通过 · 你 · 2 分钟前'; touched.push('2:62');
// Revise button -> ghost audit action
const rv=await byId('2:63'); rv.x=234; rv.resize(120,34); touched.push('2:63');
const rvl=await byId('2:64'); rvl.x=246; rvl.characters='查看决策日志'; touched.push('2:64');
// hide reject + custom input
for(const id of ['2:65','2:66','2:67','2:68']){ (await byId(id)).visible=false; touched.push(id); }
return {touched};
```

---

## F. Extend the Project Hub status timeline to delivery

**Why:** the timeline stops at `Testing` (`Draft → Asking → PRD → Tech plan → Developing → Testing`), so the user can't see the path to delivery. Extend to the full lifecycle ending in `Delivered`. The current marker stays on `Developing`.

Target frame: `9:155` (`Project Status Timeline`, `628 × 112`). Existing dots `9:157/160/163/166/169/172`, lines `9:158/161/164/167/170`, labels `9:159/162/165/168/171/173`. The script repositions the 6 existing nodes, clones 3 more dots / 3 lines / 3 labels, and recolors by state (done/active = copper, pending = warm border / muted text). Labels hug their text and clamp inside the frame.

New steps (9): `Draft · Asking · PRD · Tech plan · Developing · Testing · Deploy · Acceptance · Delivered`, current index = `4` (Developing).

### Script for F

```js
const frame=await figma.getNodeByIdAsync('9:155');
const lbl0=await figma.getNodeByIdAsync('9:159');
for(const seg of lbl0.getStyledTextSegments(['fontName'])) await figma.loadFontAsync(seg.fontName);
const steps=['Draft','Asking','PRD','Tech plan','Developing','Testing','Deploy','Acceptance','Delivered'];
const cur=4, s=74, dotY=52, lineY=58, labelY=76, FW=628;
const COPPER={r:0.784,g:0.435,b:0.239}, MUTED={r:0.843,g:0.773,b:0.698}, INK={r:0.169,g:0.129,b:0.094}, MUTEDTXT={r:0.486,g:0.435,b:0.384};
const dotIds=['9:157','9:160','9:163','9:166','9:169','9:172'];
const lineIds=['9:158','9:161','9:164','9:167','9:170'];
const labelIds=['9:159','9:162','9:165','9:168','9:171','9:173'];
const dotTpl=await figma.getNodeByIdAsync('9:157');
const lineTpl=await figma.getNodeByIdAsync('9:158');
const dots=[],lines=[],labels=[],touched=[];
for(let i=0;i<9;i++){ let d; if(dotIds[i]) d=await figma.getNodeByIdAsync(dotIds[i]); else {d=dotTpl.clone(); frame.appendChild(d);} dots.push(d); }
for(let i=0;i<8;i++){ let l; if(lineIds[i]) l=await figma.getNodeByIdAsync(lineIds[i]); else {l=lineTpl.clone(); frame.appendChild(l);} lines.push(l); }
for(let i=0;i<9;i++){ let t; if(labelIds[i]) t=await figma.getNodeByIdAsync(labelIds[i]); else {t=lbl0.clone(); frame.appendChild(t);} labels.push(t); }
for(let i=0;i<9;i++){
  const dotX=18+i*s, done=i<cur, active=i===cur;
  const d=dots[i]; d.x=dotX; d.y=dotY; d.resize(14,14); d.fills=[{type:'SOLID',color:(done||active)?COPPER:MUTED}]; touched.push(d.id);
  if(i<8){ const l=lines[i]; l.x=dotX+14; l.y=lineY; l.resize(s-14,2); l.fills=[{type:'SOLID',color:(i<cur)?COPPER:MUTED}]; touched.push(l.id); }
  const t=labels[i]; t.textAutoResize='WIDTH_AND_HEIGHT'; t.characters=steps[i]; t.fontSize=11; t.fills=[{type:'SOLID',color:(done||active)?INK:MUTEDTXT}];
  let lx=dotX+7-t.width/2; if(lx+t.width>FW) lx=FW-t.width; if(lx<0) lx=0; t.x=lx; t.y=labelY; touched.push(t.id);
}
return {touched, dots:dots.length, lines:lines.length, labels:labels.length};
```

---

## Optional follow-ups (not scripted)

- **More gate variants in Stream Mode:** the draft only shows `requirement_confirm`. Add at least a `dangerous_operation`/high-risk confirm card and a `slice_failure` card (with the restricted "request skip slice → Change Review" option) to validate the per-gate action policies (spec §6, §5.3–§5.4).
- **Project-switcher dropdown vs Project Hub modal:** in the Hub screenshot both are shown at once and the dropdown overlaps the Hub search box. They should be mutually exclusive (compact dropdown *or* full Hub modal), per spec §14.2.
