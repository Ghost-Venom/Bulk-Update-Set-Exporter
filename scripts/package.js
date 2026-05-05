// Build a single Update Set XML that customers import via
// System Update Sets > Retrieved Update Sets > Import XML.
//
// Output: releases/BulkUpdateSetExporter-<version>.xml
//
// Inputs:
//   - records/*.xml — one ServiceNow source-control record_update per file
//     (sys_app, sys_ui_page, ACLs, etc.)
//   - dist/main.js — compiled React bundle (built by scripts/build.js)
//   - package.json — drives version + filename
//
// The packager wraps each record_update payload in a <sys_update_xml> entry,
// generates a fresh <sys_ux_lib_asset> entry for the React bundle (gzipped +
// base64'd inline), and concatenates them under one <sys_remote_update_set>
// envelope inside an <unload> document.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const RECORDS_DIR = path.join(ROOT, 'records');
const DIST_DIR = path.join(ROOT, 'dist');
const RELEASES_DIR = path.join(ROOT, 'releases');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const APP_NAME = 'Bulk Update Set Exporter';
const APP_SCOPE = 'x_1404459_bulk_upd';
const APP_SCOPE_SYS_ID = '3ba1f7d3c3833210a8797b2ed40131d7';
const VERSION = PKG.version;

// Bundle target — the sys_ux_lib_asset record this app's UI page references.
// All three sys_ids (lib_asset, attachment, attachment_doc) are fixed so each
// upgrade install REPLACES the existing records via INSERT_OR_UPDATE rather
// than leaving the previous attachment behind alongside the new one.
const BUNDLE_LIB_ASSET_SYS_ID = '318c270985e94d3f941a122da1d7dfde';
const BUNDLE_ATTACHMENT_SYS_ID = 'a18c270985e94d3f941a122da1d7dfde';
const BUNDLE_ATTACHMENT_DOC_SYS_ID = 'd08c270985e94d3f941a122da1d7dfde';
const BUNDLE_FILE_NAME = `${APP_SCOPE}/main`;
const BUNDLE_CHUNK_SIZE_BYTES = 933336;

// Human-readable type labels shown in the Retrieved Update Sets UI.
const TYPE_MAP = {
    sys_app: 'Application',
    sys_app_module: 'Application Module',
    sys_ui_page: 'UI Page',
    sys_security_acl: 'ACL',
    sys_security_acl_role: 'ACL Role',
    sys_scope_privilege: 'Application Cross-Scope Privilege',
    sys_ux_lib_asset: 'UX Library Asset',
    sys_ws_definition: 'Scripted REST Service',
    sys_ws_operation: 'Scripted REST Resource',
};

function uuid() {
    return [...crypto.randomBytes(16)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function md5(buf) {
    return crypto.createHash('md5').update(buf).digest('hex');
}

function nowSnDate() {
    return new Date().toISOString().replace('T', ' ').split('.')[0];
}

function escapeXml(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
}

function extractTag(xml, tag) {
    const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`);
    const m = xml.match(re);
    return m ? m[1] : null;
}

function extractRecord(xml) {
    // Find the single <record_update ...>...</record_update> block.
    const m = xml.match(/<record_update\b[^>]*>([\s\S]*)<\/record_update>/);
    if (!m) throw new Error('record_update block not found');
    return m[0];
}

function inferTableAndId(recordUpdateXml) {
    const tableMatch = recordUpdateXml.match(/<record_update\b[^>]*\btable="([^"]+)"/);
    if (!tableMatch) throw new Error('table attribute missing');
    const table = tableMatch[1];
    const sysId = extractTag(recordUpdateXml, 'sys_id');
    if (!sysId) throw new Error(`sys_id missing for table ${table}`);
    return { table, sysId };
}

function inferTargetName(recordUpdateXml, table) {
    // Best-effort identifier for the Retrieved Update Sets UI display.
    const candidates = {
        sys_app: ['name'],
        sys_app_module: ['title', 'name'],
        sys_ui_page: ['name', 'endpoint'],
        sys_security_acl: ['name'],
        sys_security_acl_role: ['name'],
        sys_scope_privilege: ['target_name', 'source_scope'],
        sys_ux_lib_asset: ['name'],
    }[table] || ['name'];

    for (const tag of candidates) {
        const v = extractTag(recordUpdateXml, tag);
        if (v && v.trim()) return v.trim();
    }
    return extractTag(recordUpdateXml, 'sys_id') || '';
}

function buildSysUpdateXml({ recordUpdateXml, remoteUpdateSetSysId, remoteUpdateSetName }) {
    const { table, sysId } = inferTableAndId(recordUpdateXml);
    const targetName = inferTargetName(recordUpdateXml, table);
    const type = TYPE_MAP[table] || table;
    const updateXmlSysId = uuid();
    const updateGuid = uuid();
    const date = nowSnDate();
    const payloadHash = md5(Buffer.from(recordUpdateXml));

    return `<sys_update_xml action="INSERT_OR_UPDATE">
<action>INSERT_OR_UPDATE</action>
<application display_value="${escapeXml(APP_NAME)}">${APP_SCOPE_SYS_ID}</application>
<category>customer</category>
<comments/>
<name>${escapeXml(`${table}_${sysId}`)}</name>
<payload>${escapeXml(recordUpdateXml)}</payload>
<payload_hash>${payloadHash}</payload_hash>
<remote_update_set display_value="${escapeXml(remoteUpdateSetName)}">${remoteUpdateSetSysId}</remote_update_set>
<replace_on_upgrade>false</replace_on_upgrade>
<sys_created_by>admin</sys_created_by>
<sys_created_on>${date}</sys_created_on>
<sys_id>${updateXmlSysId}</sys_id>
<sys_mod_count>0</sys_mod_count>
<sys_recorded_at/>
<sys_updated_by>admin</sys_updated_by>
<sys_updated_on>${date}</sys_updated_on>
<table>${table}</table>
<target_name>${escapeXml(targetName)}</target_name>
<type>${escapeXml(type)}</type>
<update_domain>global</update_domain>
<update_guid>${updateGuid}</update_guid>
<update_guid_history/>
<update_set/>
<view/>
</sys_update_xml>`;
}

function buildBundleRecordUpdate(bundlePath) {
    const raw = fs.readFileSync(bundlePath);
    const gz = zlib.gzipSync(raw);
    const base64 = gz.toString('base64');
    const rawMd5 = md5(raw);
    const date = nowSnDate();
    const attachmentSysId = BUNDLE_ATTACHMENT_SYS_ID;
    const docSysId = BUNDLE_ATTACHMENT_DOC_SYS_ID;

    return `<record_update table="sys_ux_lib_asset">
<sys_ux_lib_asset action="INSERT_OR_UPDATE">
<bundled_asset>false</bundled_asset>
<category>component</category>
<checksum>${rawMd5}</checksum>
<config_option/>
<content/>
<content_meta/>
<dependencies/>
<es_module>true</es_module>
<is_attachment>true</is_attachment>
<mime_type>application/javascript</mime_type>
<name>${escapeXml(BUNDLE_FILE_NAME)}</name>
<sys_class_name>sys_ux_lib_asset</sys_class_name>
<sys_created_by>admin</sys_created_by>
<sys_created_on>${date}</sys_created_on>
<sys_id>${BUNDLE_LIB_ASSET_SYS_ID}</sys_id>
<sys_mod_count>0</sys_mod_count>
<sys_name>${escapeXml(BUNDLE_FILE_NAME)}</sys_name>
<sys_package display_value="${escapeXml(APP_NAME)}" source="${APP_SCOPE}">${APP_SCOPE_SYS_ID}</sys_package>
<sys_policy/>
<sys_scope display_value="${escapeXml(APP_NAME)}">${APP_SCOPE_SYS_ID}</sys_scope>
<sys_update_name>sys_ux_lib_asset_${BUNDLE_LIB_ASSET_SYS_ID}</sys_update_name>
<sys_updated_by>admin</sys_updated_by>
<sys_updated_on>${date}</sys_updated_on>
</sys_ux_lib_asset>
<sys_attachment action="INSERT_OR_UPDATE">
<average_image_color/>
<chunk_size_bytes>${BUNDLE_CHUNK_SIZE_BYTES}</chunk_size_bytes>
<compressed>true</compressed>
<content_type>application/javascript</content_type>
<file_name>${escapeXml(BUNDLE_FILE_NAME)}</file_name>
<hash>${rawMd5}</hash>
<image_height/>
<image_width/>
<size_bytes>${raw.length}</size_bytes>
<size_compressed>${gz.length}</size_compressed>
<state>available</state>
<sys_created_by>admin</sys_created_by>
<sys_created_on>${date}</sys_created_on>
<sys_id>${attachmentSysId}</sys_id>
<sys_mod_count>0</sys_mod_count>
<sys_updated_by>admin</sys_updated_by>
<sys_updated_on>${date}</sys_updated_on>
<table_name>sys_ux_lib_asset</table_name>
<table_sys_id>${BUNDLE_LIB_ASSET_SYS_ID}</table_sys_id>
</sys_attachment>
<sys_attachment_doc>
<data>${base64}</data>
<length>${base64.length}</length>
<position>0</position>
<sys_attachment>${attachmentSysId}</sys_attachment>
<sys_id>${docSysId}</sys_id>
</sys_attachment_doc>
</record_update>`;
}

function buildRemoteUpdateSet(remoteUpdateSetSysId, name) {
    const date = nowSnDate();
    return `<sys_remote_update_set action="INSERT_OR_UPDATE">
<application display_value="${escapeXml(APP_NAME)}">${APP_SCOPE_SYS_ID}</application>
<application_name>${escapeXml(APP_NAME)}</application_name>
<application_scope>${APP_SCOPE}</application_scope>
<application_version>${escapeXml(VERSION)}</application_version>
<collisions/>
<commit_date/>
<deleted/>
<description>${escapeXml(PKG.description || '')}</description>
<inserted/>
<name>${escapeXml(name)}</name>
<origin_sys_id/>
<parent display_value=""/>
<release_date/>
<remote_base_update_set display_value=""/>
<remote_parent_id/>
<remote_sys_id>${remoteUpdateSetSysId}</remote_sys_id>
<state>loaded</state>
<summary/>
<sys_class_name>sys_remote_update_set</sys_class_name>
<sys_created_by>admin</sys_created_by>
<sys_created_on>${date}</sys_created_on>
<sys_id>${remoteUpdateSetSysId}</sys_id>
<sys_mod_count>0</sys_mod_count>
<sys_updated_by>admin</sys_updated_by>
<sys_updated_on>${date}</sys_updated_on>
<update_set display_value=""/>
<update_source display_value=""/>
<updated/>
</sys_remote_update_set>`;
}

(function main() {
    const bundlePath = path.join(DIST_DIR, 'main.js');
    if (!fs.existsSync(bundlePath)) {
        console.error(`Missing ${bundlePath} — run \`npm run build\` first.`);
        process.exit(1);
    }
    fs.mkdirSync(RELEASES_DIR, { recursive: true });

    const ARCHIVE_DIR = path.join(RELEASES_DIR, 'archive');
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

    // Move any existing release XMLs into the archive folder so only
    // the current release lives at the root of releases/.
    for (const f of fs.readdirSync(RELEASES_DIR)) {
        if (f.endsWith('.xml')) {
            const oldPath = path.join(RELEASES_DIR, f);
            const newPath = path.join(ARCHIVE_DIR, f);
            if (!fs.existsSync(newPath)) {
                fs.renameSync(oldPath, newPath);
            }
        }
    }

    const remoteUpdateSetSysId = uuid();
    const remoteUpdateSetName = `${APP_NAME} v${VERSION}`;

    const recordFiles = fs.readdirSync(RECORDS_DIR)
        .filter(f => f.endsWith('.xml'))
        .sort();

    const updateXmls = [];

    // Static records from records/. Rewrite the sys_app <version> field to
    // match package.json so the My Applications UI displays the correct version.
    for (const f of recordFiles) {
        let xml = fs.readFileSync(path.join(RECORDS_DIR, f), 'utf8');
        if (f.startsWith('sys_app_') && !f.startsWith('sys_app_module_')) {
            xml = xml.replace(/<version>[^<]*<\/version>/, `<version>${escapeXml(VERSION)}</version>`);
        }
        const recordUpdateXml = extractRecord(xml);
        updateXmls.push(buildSysUpdateXml({ recordUpdateXml, remoteUpdateSetSysId, remoteUpdateSetName }));
    }

    // Generated bundle record
    const bundleRecordUpdate = buildBundleRecordUpdate(bundlePath);
    updateXmls.push(buildSysUpdateXml({ recordUpdateXml: bundleRecordUpdate, remoteUpdateSetSysId, remoteUpdateSetName }));

    const date = nowSnDate();
    const remoteUpdateSet = buildRemoteUpdateSet(remoteUpdateSetSysId, remoteUpdateSetName);

    const xml = `<?xml version="1.0" encoding="UTF-8"?><unload unload_date="${date}">
${remoteUpdateSet}
${updateXmls.join('\n')}
</unload>`;

    const outName = `BulkUpdateSetExporter-${VERSION}.xml`;
    const outPath = path.join(RELEASES_DIR, outName);
    fs.writeFileSync(outPath, xml);

    console.log(`Packaged ${recordFiles.length} static records + 1 bundle record`);
    console.log(`Wrote ${path.relative(ROOT, outPath)} (${(xml.length / 1024).toFixed(1)} KiB)`);
})();
