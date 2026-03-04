---
"@coffeexdev/openclaw-sentinel": patch
---

Remove remaining zod usage from plugin config validation by migrating `configSchema` to TypeBox runtime checks.
This eliminates runtime `Cannot find module 'zod'` loader failures.
