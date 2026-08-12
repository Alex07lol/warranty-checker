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
- Commit pattern to use:

```bash
git -c user.name='<Identity>' -c user.email='<email>' commit -m '...'
git push origin main
```
