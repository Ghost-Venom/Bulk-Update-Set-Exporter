# Changelog

## 0.2.3

### Fixed
- **Exported update sets now commit on the receiving instance instead of failing with `Scope 'Global' is not 'Global', not found in instance`.** The `<application>` element in each exported `sys_update_xml` had its text content set to the scope's *display name* ("Global") instead of the scope's *value* ("global" for the global app, or the scope's sys_id for scoped apps). ServiceNow looks the reference up by value and rejected the unknown name. The same fix applies to `<application_scope>` on the parent `<sys_remote_update_set>`.

## 0.2.2

### Fixed
- **Re-importing an exported update set no longer fails with "is not valid XML."** Customer-update payloads were wrapped in `<![CDATA[…]]>`, but those payloads themselves often contain inner CDATA blocks (script includes, business rules, UI scripts). CDATA cannot nest — the inner `]]>` closed the outer section and corrupted the document. Switched to entity-encoded payloads, matching ServiceNow's own update-set export format.
- **State filter no longer silently drops matching update sets.** The query previously OR'd five speculative encodings together and a buggy client-side fallback dropped records whose state internal-value differed from their display-value spelling. Replaced with a single `stateIN<value1,value2,…>` clause and removed the client-side filter; counts now match the native Local Update Sets list.

### Changed
- Result limit raised from 500 to 1000. The "Showing first N of X" warning still kicks in when the limit is hit.
- Reinstalling now replaces the prior bundle attachment in place (stable `sys_attachment` and `sys_attachment_doc` sys_ids) instead of leaving the old one alongside the new one.

## 0.2.1

### Fixed
- **Customer updates now associate with their parent retrieved update set on import.** The exported XML's `sys_update_xml.remote_update_set` field was previously set to the source instance's `sys_update_set.sys_id` (which becomes `remote_sys_id` on the receiving side), so the imported update XML records were orphaned from their parent `sys_remote_update_set`. The fix generates the receiving-side parent `sys_id` once and reuses it as the reference on every child.
- **"Created By" filter now matches the native Local Update Sets list count.** The filter sent `created_by=<user_sys_id>`, which only matches `sys_metadata.created_by` (the reference field, populated on a subset of records). Switched to `sys_created_by=<username>`, which is populated on every row — matches the native list filter exactly.

### Changed
- Repackaged as a single importable Update Set XML; no longer distributed via ServiceNow source-control linkage. Customers install via **Retrieved Update Sets → Import XML**.

## 1.0.0

Initial release.
