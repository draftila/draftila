# Font test fixtures

All files derive from **JetBrains Mono**, licensed under the SIL Open Font License 1.1.

| File                             | Source                                                                           | Notes                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `JetBrainsMono-Regular.ttf`      | `fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400` (TTF variant)         | Subset to U+0020–U+007E with `pyftsubset`. 400 / normal.                               |
| `JetBrainsMono-Regular.woff`     | Re-flavoured from `JetBrainsMono-Regular.ttf` with `fontTools`                   | Same face as the TTF, so uploading both into one family collides on `(weight, style)`. |
| `JetBrainsMono-Regular.woff2`    | `fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400` (latin subset)        | Unmodified Google Fonts bytes. 400 / normal.                                           |
| `JetBrainsMono-BoldItalic.woff2` | `fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@1,700` (latin subset) | Unmodified Google Fonts bytes. 700 / italic — pins weight/style inference.             |
| `JetBrainsMono-NoOS2.ttf`        | Derived from `JetBrainsMono-Regular.ttf` with `fontTools` (`del font['OS/2']`)   | Parses, but has no `OS/2` table — pins the inference-impossible rejection.             |
| `JetBrainsMono-Variable.ttf`     | `github.com/JetBrains/JetBrainsMono` `fonts/variable/JetBrainsMono[wght].ttf`    | Subset to U+0020–U+007E, `fvar` retained — pins the variable-font rejection.           |

Upstream: <https://github.com/JetBrains/JetBrainsMono> · Licence: <https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt>
