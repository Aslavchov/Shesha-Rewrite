# ADR 0009: Properties and styles

- Status: accepted
- Date: 15 November 2026
- Phase: 3

## Context

Phase 3 makes a dropped component configurable: its name and data path, its settings and its styles, edited live on the canvas and undoable. Four things about that are expensive to change later, and the Phase 3 spec asks for them to be recorded and frozen: the new editing operations, how a run of edits becomes one undo step, how the panel is generated from definitions, and the interface of the Appearance editor, which the Phase 4 theme editor reuses. Tabs adds a fifth: its regions are keyed by stable keys.

The document format (ADR 0003), the component contract (ADR 0004), the slot style model (ADR 0006) and the three editing operations (ADR 0008) are frozen. Everything here extends them; nothing in them changes meaning.

## Decision

### 1. New editing operations, beside insert, move and remove

`web/src/designer/model/operations.ts` now has two families. The tree operations are ADR 0008's, unchanged. The edit operations change one instance, or the form, in place:

| Operation | Does | Refused when |
| --- | --- | --- |
| `rename { id, name }` | Gives an instance another name. The id never changes | Not an identifier, over 64 characters, or another instance's name |
| `bind { id, path }` | Stores an input's value under another data path | Not a valid path, or equal to, inside or around another instance's path; or the instance is not an input |
| `set-setting { id, key, value }` | Stores one setting of an instance, or of the form when `id` is null | (see below) |
| `reset-setting { id, key }` | Removes one stored setting, so the default applies again (ADR 0003, D5) | |
| `set-style { id, slot, style }` | Replaces one slot's overrides. An empty style removes the slot | |
| `rename-form { name }` | Renames the form | Blank, or over 200 characters |
| `describe-form { description }` | Sets the description. Empty text removes it | Over 1000 characters |

They keep every guarantee of the first three. They name instances by id. They apply completely or are refused and change nothing; an edit that would leave the document as it is is refused as `no-change`, so it never costs an undo step. They never mutate: the result shares every untouched instance with the document before it. Empty `settings`, `styles` and `description` are left out, so a document still reads as "what was decided".

**Who checks a value.** An operation checks what the server checks (names, paths, the form's name and description, the request limits), so the designer still never produces a document the server would refuse; the property-based test (C3-16) runs every new command, valid and not, and holds every result to `rules.ts`. Whether a setting's value is *meaningful* is the component's to say, and the server never knows components (ADR 0003). So the command that builds `set-setting` asks the component first, through a new function on its definition, `checkSettings(stored)`, which reports what the renderer would reject: a value its descriptor's parser refuses, a key it does not have, and a broken constraint between settings (below). A value with a problem is refused before it is an operation. The properties panel asks the same function as a person types, so it can say why.

**Commands.** `runCommand` gains `rename`, `bind`, `set-setting`, `reset-setting`, `set-style` (one property of one slot; `undefined` removes it), `reset-slot`, `rename-form` and `describe-form`. The selection does not change. Each says in words what it did ("Label of firstName: “First name”."), including when a setting hides components or shows them again ("Columns of row: 2. 1 component now hidden; it comes back when the region is shown again.").

### 2. A run of edits is one undo step

Any of the new commands may carry `merge`, a key that names a run of edits. A history entry records the key of the change that made it. When a change carries the same key as the last entry, and nothing has been undone since (the redo list is empty), it does not add an entry: it replaces the document after that entry. One undo then returns to the document from before the whole run, which is the very object that was there.

The properties panel gives every field a new key each time the field takes focus (`edit-run.ts`). Everything typed into it until it loses focus is one run: typing a label, holding an arrow key on a number, typing a hex colour. A click on a switch, a choice from a list, a reset, adding or removing a row are each a step of their own. Undo and redo are never merged, so a run interrupted by an undo starts afresh.

Only the first change of a run is announced; announcing every keystroke would drown out the typing itself.

In the panel, Ctrl+Z and Ctrl+Y (and ⌘ on a Mac) are the designer's undo and redo, not the field's own. A field's draft follows the document, so undo shows the restored value at once. The same holds in popups the panel opens: otherwise the browser's own undo would act on whichever field it last saw typed into.

### 3. The panel is generated from definitions

`web/src/designer/properties/` builds the panel from the selected component's definition and nothing else. No file there names a component type.

- **One editor per setting kind.** `EDITORS` is a `Record<SettingKind, Editor>`, so a new kind does not compile until it has an editor. The kinds in use are text (one line or several), number, boolean, choice, date, pattern, options, number list, messages and tabs.
- **Sections by group.** Settings are shown in the order the definition lists them, in sections by their `group`: General, Data, Validation, Layout. Adding a setting to a definition adds it to the panel with no panel change; a unit test proves it with a test component.
- **Set or default.** A setting is set when its key is stored on the instance, whatever its value. A set setting shows a marker and a reset; reset removes the key. Choosing a value equal to the default still stores it, because a later default (the Phase 4 theme) should not move a value someone chose on purpose.
- **Drafts.** Each editor keeps what is being typed. A value that its setting rejects, or that breaks a constraint, is shown with the reason under it and never reaches the document. Emptying an optional field resets it. When the document changes some other way (undo), the draft follows.
- **Identity.** Name and data path sit above the settings and are checked with the server's own rules from `rules.ts`, plus uniqueness. The id is never shown.
- **The form.** With nothing selected the panel edits the form: its name, its description and its own settings, generated the same way from `formSettings`.

The contract gained these optional parts, all additive (ADR 0004 is extended, not changed):

| Where | Added | For |
| --- | --- | --- |
| Setting descriptor | `choicesFrom(settings)` | A choice among values another setting holds: a default that must be one of the options, a default tab |
| Setting descriptor | `limits`, `multiline` | An editor that can say "Enter a whole number, 0 or more", and a text area for long text |
| Setting kind | `tabs` | Tab lists with stable keys |
| Definition | `constraints` | Rules between settings that are each valid alone: minimum not above maximum, earliest date not after latest. The type system checks that a constraint's settings exist |
| `ComponentDefinition` | `checkSettings(stored)` | The question the panel and the commands ask before storing a value |
| Container definition | `regionLabel(settings, name)` | A region shown by a name people use: a tab's label instead of its key |
| `ContainerProps` | `shownRegion`, `regionSwitch(name)` | Tabs on the canvas, below |
| `InstanceProblem` | `setting`, `slot`, `property` | What a problem is about, so it can offer its fix |
| Category | `content` | Text and Alert in the toolbox |

### 4. The Appearance editor

`web/src/designer/appearance/appearance-editor.tsx` edits the style overrides of every slot of one thing, as data. It is one component with no knowledge of the designer, its store or its commands:

```ts
type AppearanceEditorProps = {
  slots: readonly string[]                              // a definition's slots
  styles: Readonly<Record<string, SlotStyle>> | undefined // the overrides set now
  defaults: { label: string; styles?: Readonly<Record<string, SlotStyle>> }
  onChange(slot, property, value | undefined, run?): void // undefined removes the override
  onResetSlot(slot): void
  onPoint?(slot | null): void                            // the slot hovered or focused
  testIdPrefix?: string                                  // "props" in the designer
}
```

- **Where defaults come from** is a parameter. In the designer it is the component's own look, labelled "Default". The Phase 4 theme editor passes the components' look as the defaults and edits the theme's slot styles; the designer will then pass the theme's styles as an instance's defaults, labelled "From the theme". The editor shows an unset property with the value it inherits.
- **Colours are a theme colour first.** The colour picker opens on the theme colours, named in words (Text, Muted, Primary, Success…), each a system token that follows light and dark mode. A custom hex value is below them, marked as staying the same in dark mode.
- **Set or default, and reset,** per property and per slot.
- **Pointing.** `onPoint` reports the slot under the pointer or focus. The designer draws that slot's elements on the canvas with a dashed outline and the slot's name. It finds them by a `data-form-slot` attribute that `resolveSlots` now puts in every slot's props, next to the style it already carried (ADR 0006 is extended: the attribute names the part; it styles nothing).
- Hover overrides and per-side padding stay out, as the spec says.

### 5. Tabs regions are keyed by stable keys

A Tabs instance stores `tabs: [{ key, label }]`. Each tab's region is named by its key, never by its label, so renaming a tab never moves its content. A key is a valid region name and never shown. A new tab takes the lowest `tabN` that no tab has and no stored region of the instance has, so a new tab never inherits the components of one that was removed. Removing a tab follows the hidden-region rule of ADR 0003: its components stay in the document, are marked hidden in the outline, and undo brings the tab back with them.

On the canvas, choosing a tab shows its region, which then takes drops. The canvas is inert, so the designer does it: a container spreads `regionSwitch(name)` on each tab, the canvas measures those elements and lays a button over each, and pressing one selects the container and asks it, through `shownRegion`, to show that region. Selecting something inside a tab shows that tab; the tab list in the panel can show any tab, from the keyboard too.

When the form runs, every tab panel stays mounted, so a required field in a tab that is not shown still blocks a submit. Before focusing the first invalid field, the renderer sends it a bubbling `form-reveal` event; Tabs shows the tab that holds it, synchronously, and the focus lands.

### 6. Problems

`web/src/designer/model/problems.ts` turns what the renderer records about an instance into sentences for its author: an unknown type, a setting or style the renderer ignores, a broken constraint, an input with no data path, components in a region the container does not show now. Each offers a fix where one is obvious, as a command: reset the setting, remove the unknown key or slot, reset the style value, store the value under the instance's name. An unknown type has none: deleting is not obviously right. The outline marks every instance with problems; the panel lists them first.

### 7. Three colour tokens

Alert needs success, warning and information colours. `--sys-color-success`, `--sys-color-warning` and `--sys-color-info` join the system tokens, with light and dark values that keep 4.5:1 for text against the background, and `COLOR_TOKENS`, so a document may refer to them. This adds to ADR 0002's tokens; none changes.

## Alternatives considered

- **One generic `update { id, patch }` operation.** Fewer types, but a patch can say anything, so every reader has to work out what it changed, and the refusal reasons become vague. Named operations say what they do, are refused for named reasons, and are what a later collaboration or audit log would want to record.
- **Merging by time** (keystrokes less than a second apart are one step). It depends on how fast someone types, and two separate edits of one field made quickly become one. A run that ends when the field loses focus is what people mean by "one edit", and it is testable.
- **Merging by target** (every change of `label` on one instance is one step). Two edits of the label a minute apart would undo together.
- **Committing on blur or Enter.** The canvas would not change as you type, which the spec asks for, and an edit abandoned by closing the tab would be lost.
- **Hand-written settings forms per component** (the current Shesha). Ruled out by ADR 0004 and the spec; it is where component knowledge drifts.
- **A JSON-Schema form library for the panel.** It would need our kinds, groups, set-or-default, drafts, merging and the hidden-region warning added on top, which is most of the panel. The editors are small.
- **Tab regions named by index** (`tab0`, `tab1`). Reordering tabs would move content between them. Named by label: renaming would lose it.
- **Clicking through the inert canvas to the real tab.** The canvas is inert by design (ADR 0008), so that nothing on it can be typed into or focused. Measured switches keep that, and keep the canvas the real renderer.
- **Unmounting the panels of hidden tabs.** Their fields would not validate, so a form could be submitted with a required field empty in another tab.

## Which later phase this serves

| Decision | Serves |
| --- | --- |
| Named edit operations | Phase 6: scripts that change settings go through the same operations; collaboration could replay them |
| Runs of edits | Every editor that comes later: the theme editor, entity binding |
| The generated panel | Phases 4 to 6: theme, entity and event settings appear when a definition declares them |
| `checkSettings` and constraints | Phase 5: binding checks; Phase 6: scripts that set settings are checked the same way |
| The Appearance editor's interface | Phase 4: the theme editor, with the components' look as its defaults |
| `data-form-slot` | Phase 4: the theme preview can point at a slot the same way |
| Stable tab keys | Phase 6: `form.components.tabs.show("<key>")` is stable across renames |

## Consequences

- Frozen after this phase, changeable only through a new ADR: the edit operations and their refusals; how changes merge into undo steps (`merge` keys, one run per field focus); the panel being generated from definitions, one editor per kind; the Appearance editor's props; Tabs regions keyed by stable keys.
- A component that adds a setting gets an editor for free when its kind exists; a new kind needs an editor, and the compiler says so.
- A setting whose value is valid alone but not with another needs a constraint on the definition, not a check in the panel.
- Every slot element carries `data-form-slot`. Snapshot tests of components see one more attribute.
