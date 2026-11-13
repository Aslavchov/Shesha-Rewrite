# ADR 0003: The form document format

- Status: accepted
- Date: 13 November 2026
- Phase: 1

## Context

A form is data. The designer (Phase 2), the properties panel (Phase 3), the theme editor (Phase 4), entity binding (Phase 5) and scripting (Phase 6) all read and write the same document, so its shape is the most expensive thing in the product to change later. The Phase 1 spec sets eight requirements (D1 to D8); this record states the shape that meets them.

## Decision

### The shape

```json
{
  "formatVersion": 1,
  "name": "Person details",
  "description": "Demo form covering every Phase 1 component.",
  "settings": { "gap": "md" },
  "components": [
    {
      "id": "c_k3v9q2m7xa",
      "type": "columns",
      "name": "nameRow",
      "regions": {
        "col1": [
          {
            "id": "c_8r2d5n1wpe",
            "type": "text-field",
            "name": "firstName",
            "bind": "firstName",
            "settings": { "label": "First name", "required": true, "maxLength": 50 }
          }
        ],
        "col2": []
      }
    },
    {
      "id": "c_p4h7t6b2ys",
      "type": "text-field",
      "name": "email",
      "bind": "email",
      "settings": { "label": "Email", "required": true },
      "styles": { "label": { "color": "#003BB2" } }
    }
  ]
}
```

**Form level**

| Key | Meaning |
| --- | --- |
| `formatVersion` | Integer. The version of this whole format. The only version marker anywhere in a document. |
| `name` | What people call the form. 1 to 200 characters. |
| `description` | Optional, up to 1000 characters. |
| `settings` | Optional. The form's own settings, stored like a component's: only what differs from the default. Phase 1 has one, `gap`. |
| `components` | The form's top-level region: an ordered list of instances. |

**Component instance**

| Key | Meaning |
| --- | --- |
| `id` | Generated, stable, never reused, never shown to people. 1 to 64 characters from `A-Z a-z 0-9 _ -`. The designer generates `c_` plus ten random base-32 characters. |
| `type` | The component type id, such as `text-field`. |
| `name` | Unique within the form; an ASCII JavaScript identifier (`[A-Za-z_$][A-Za-z0-9_$]*`), up to 64 characters. |
| `bind` | Inputs only. The data path the value is stored under. |
| `settings` | Optional. Only the settings this instance changes; the values are JSON defined by the component type. |
| `styles` | Optional. Style overrides per named slot. See [ADR 0006](0006-slot-styles.md). |
| `regions` | Containers only. Region name to ordered list of child instances. Nesting has no depth limit. |

Optional keys are left out when empty, so a document reads as "what was decided", nothing more.

### Rules

- **Format version (D1).** One integer for the whole document. This build reads version 1. The server refuses to store any other version; the renderer, given one, shows a clear message instead of rendering. A change that old builds would misread raises the number; purely additive optional keys do not. There is never a per-component version: a component whose settings change shape migrates through a format version.
- **Ids and names (D2).** Both are unique across the whole form, at any depth. Ids are what the designer moves and what state is keyed by; names are what people and scripts use (`form.components.<name>`), which is why they must be identifiers.
- **Regions (D3).** A region is addressed by `(parent id or none, region name)`. The form's `components` list is the one region with no parent. Moving any instance to any region is "remove from one list, insert into another". Region names are owned by the component type: Container has `content`; Columns has `col1` to `col4`.
- **Data paths (D4).** Identifier segments joined by dots (`contact.preferredMethod`). No two instances share a path, and no path is a prefix of another (`contact` and `contact.method` cannot both hold a value). Submitted values are nested by path.
- **Sparse settings (D5).** Defaults live in the component definition and are never written into a document. Resolving "stored value or default" happens when the form is rendered.
- **Styles (D6).** Typed values per named slot; no CSS, class names or selectors anywhere in the format.
- **Spacing (D7).** No instance has a margin. The space between siblings is the `gap` setting of whatever holds them: the form, a Container or a Columns.
- **Plain JSON (D8).** Keys are camelCase words, values are strings, numbers, booleans, lists and objects. Nothing is encoded, escaped or positional.

### Where it is defined

The structure (`FormDocument`, `ComponentInstance`, `SlotStyle` and the style value types) is defined in `crates/contracts` and generated into TypeScript. What goes inside `settings` is defined with each component in `web/`, because only the component knows it.

### Who checks what

| Check | Server (on create and update) | Client (when rendering) |
| --- | --- | --- |
| JSON matches the structure; style values are of the fixed types | Yes | Trusts the server, and ignores what it cannot read |
| `formatVersion` is known | Yes | Yes; shows a message |
| Ids unique and well formed | Yes | |
| Names unique and valid identifiers | Yes | |
| Data paths valid, unique, no prefix clashes | Yes | |
| Component type exists | | Yes; placeholder |
| Region belongs to the type | | Yes; the region is not rendered and a problem is recorded |
| Setting values valid | | Yes; falls back to the default |
| Slot exists; colour token exists | | Yes; the override is ignored |
| An input has a `bind` | | Yes; shown as a component error |

The server never needs to know a component type, so adding a component never touches Rust. The server stores the document as it was sent and returns it untouched, so a newer document read by an older build still reaches the renderer's version message.

## Alternatives considered

- **A flat map of instances plus a separate layout tree** (the shape the current Shesha uses). Moving is cheap, but every reader has to join two structures, and the two can disagree. A nested tree cannot contain an orphan or a cycle, reads top to bottom like the form, and a move is still one operation.
- **The root as a Container instance.** Uniform, but the root could then be any type, and it would use up a name and an id for something nobody placed. An explicit top-level list with form-level `settings` is easier to read.
- **Validation rules as a separate block per instance.** Rules are settings like any other (`required`, `maxLength`), so the properties panel, defaults and "reset to default" treat them the same way. Custom messages sit in one `messages` setting keyed by rule.
- **JSON Schema as the document format.** It describes data, not layout, slots or regions, and would still need a second document beside it.

## Which later phase this serves

| Decision | Serves |
| --- | --- |
| Stable ids, regions as ordered lists | Phase 2: select, move, insert and delete by id |
| Identifier names | Phase 6: `form.components.<name>` |
| Sparse settings | Phase 3: "set or default" with reset; a changed default reaches every instance |
| Typed slot styles | Phases 3 and 4: styles edited as data |
| Data paths | Phase 5: paths become entity properties |
| Form-level `settings` | Phases 3 to 6: form-wide options arrive without a new mechanism |
| One format version | Every phase: one migration point |

## Consequences

- A document cannot hold two instances with one name even in different containers. That is what makes `form.components.<name>` unambiguous.
- Columns keeps children in `col3` even if its `columns` setting drops to 2. They stay in the document, unrendered, with a recorded problem; Phase 2 decides what the designer does about it.
- The format is frozen after this phase. Changing it needs a new ADR and, if old builds would misread the result, a new format version.
