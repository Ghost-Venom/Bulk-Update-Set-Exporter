# Bulk Update Set Exporter

A ServiceNow scoped application that lets administrators bulk-export local update sets from any instance into a single zip file (one XML per update set, plus a CSV manifest). Useful for migrating, archiving, or backing up update set work in volume.

## Install

1. Download the latest `BulkUpdateSetExporter-x.y.z.xml` from the [Releases](../../releases) page.
2. In your ServiceNow instance, navigate to **System Update Sets → Retrieved Update Sets**.
3. Click **Import Update Set from XML** and upload the file.
4. Open the resulting Retrieved Update Set, click **Preview Update Set**, then **Commit Update Set** once preview completes without errors.
5. Navigate to **System Update Sets → Bulk Export View** (admin role required) — that's the app.

No source-control linkage, no SDK, no dependencies on the publisher's instance. Anyone with admin can install.

### Upgrading

Repeat the install. The update set's records use stable `sys_id`s, so reimporting a newer version updates in place rather than duplicating.

## What's in the box

- A scoped app `x_1404459_bulk_upd` (label: *Bulk Update*)
- One UI page mounted at `x_1404459_bulk_upd_sys_update_set_export_view.do` plus a navigation module under *System Update Sets* (admin role required)
- The compiled React frontend (single bundle, no external CDN deps)
- ACLs and scope privileges scoped to the app's tables/operations

## For developers

Want to fork, fix, or extend? You only need Node 18+:

```bash
git clone <this repo>
npm install
npm run package        # builds the React bundle and emits releases/BulkUpdateSetExporter-<version>.xml
```

Repo layout:

| Path | What it is |
|---|---|
| `src/client/` | React 18 source — entry, app shell, components, services, CSS |
| `records/` | One ServiceNow `record_update` XML per app record (UI page, ACLs, etc.). Source-of-truth for the platform records the app installs |
| `scripts/build.js` | esbuild runner — compiles `src/client/main.jsx` → `dist/main.js` (single ES module, CSS injected at runtime) |
| `scripts/package.js` | Wraps each `records/*.xml` plus the freshly-built bundle into a single `<unload>` Update Set XML under `releases/` |
| `dist/`, `node_modules/`, `releases/` | gitignored / build output |

To bump the version, edit `package.json` — `scripts/package.js` rewrites the embedded `sys_app.<version>` to match and names the output file accordingly.

## License

[MIT](LICENSE) — see file for terms.

