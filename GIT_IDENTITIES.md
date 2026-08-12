# Git Identity Mapping

Confirmed by the team (2026-08-12). **Use these identities when committing changes, and push after every completed task in that sector.**

| Sector / change type | Identity | Email |
|---|---|---|
| **Default — everything else** (UI, web, deploy, backend logic, chores, docs) | Alex07lol | aakashgalex07@gmail.com |
| **OCR / document parsing** (warranty/PDF/receipt extraction) | Yadhukrishna K B | ykprofessional2007@gmail.com |
| **Backend performance / MongoDB** (indexes, batching, cold starts) | C0sm0-wolf | balahrishi567@gmail.com |
| **Backend fixes / SonarQube** (backend lint/code-quality fixes) | Joel | joelbaby124@gmail.com |
| **Location-related** (repair centres, places, maps, shop search) | shreyas | shreyassudhir13@gmail.com |

## Notes

- shreyas also built the original WebGL aurora/particles effects.

## Commit policy (mandatory, confirmed 2026-08-12)

**Every commit is made under the identity of its sector. This is the only way to commit.**

1. A change in a named sector **must** be committed as that sector's identity — never default it to Alex07lol.
2. Alex07lol is only for genuinely default work (UI/web, deploy, chores, docs, general backend logic) — not a catch-all for everything.
3. A task spanning multiple sectors is **split into one commit per sector**, each under its own identity (same content, correct attribution).
4. Push after every completed task.

Commit pattern:

```bash
git -c user.name='<Identity>' -c user.email='<email>' commit -m '...'
git push origin main
```

### Deciding the identity

- **Places / Google Places proxy / repair centres / maps / geocoding / shop search** → shreyas
- **OCR / PDF / receipt / warranty-text extraction** → yadhu (Yadhukrishna K B)
- **MongoDB indexes, serial-dedup, batching, perf, cold starts** → C0sm0-wolf
- **Security hardening, env validation, upload validation, rate limits, error handling** → Joel
- **Everything else (frontend, docs, deploy, chores, general backend)** → Alex07lol
