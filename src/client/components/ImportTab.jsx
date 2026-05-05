import React, { useRef, useState } from 'react';
import ProgressModal from './ProgressModal.jsx';

export default function ImportTab({ service }) {
    const fileInputRef = useRef(null);
    const [parsedUpdateSets, setParsedUpdateSets] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);
    const [createParent, setCreateParent] = useState(true);
    const [parentName, setParentName] = useState(() => {
        const d = new Date();
        return `Bulk Import — ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    const [isDragOver, setIsDragOver] = useState(false);
    const [parseError, setParseError] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0, name: '' });
    const [importResult, setImportResult] = useState(null);

    const handleFile = async (file) => {
        if (!file) return;
        setParseError(null);
        setImportResult(null);
        setParsedUpdateSets([]);
        setSelectedIds([]);
        try {
            const results = await service.parseExportZip(file);
            if (results.length === 0) {
                setParseError('No update set XML files found in this ZIP.');
                return;
            }
            setParsedUpdateSets(results);
            setSelectedIds(results.map(us => us.remoteUpdateSetSysId));
        } catch (err) {
            setParseError(`Failed to parse ZIP: ${err.message}`);
        }
    };

    const handleFileInput = (e) => handleFile(e.target.files[0]);

    const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
    const handleDragLeave = () => setIsDragOver(false);
    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFile(e.dataTransfer.files[0]);
    };

    const handleSelectAll = () => setSelectedIds(parsedUpdateSets.map(us => us.remoteUpdateSetSysId));
    const handleDeselectAll = () => setSelectedIds([]);
    const handleRowSelect = (id, checked) => {
        setSelectedIds(checked ? [...selectedIds, id] : selectedIds.filter(x => x !== id));
    };

    const handleImport = async () => {
        if (selectedIds.length === 0) return;
        const selected = parsedUpdateSets.filter(us => selectedIds.includes(us.remoteUpdateSetSysId));
        setIsImporting(true);
        setImportProgress({ current: 0, total: selected.length, name: '' });
        setImportResult(null);
        try {
            const result = await service.importUpdateSets(selected, (p) => setImportProgress(p), { createParent, parentName });
            setImportResult(result);
        } catch (err) {
            setImportResult({ success: [], failed: [{ name: 'Import', error: err.message }] });
        } finally {
            setIsImporting(false);
            setImportProgress({ current: 0, total: 0, name: '' });
        }
    };

    const hasParsed = parsedUpdateSets.length > 0;

    return (
        <div>
            <div className="section">
                <div className="section-title">Upload Export ZIP</div>
                <div
                    className={`drop-zone${isDragOver ? ' drag-over' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <div style={{ fontSize: '2em', marginBottom: '8px' }}>📁</div>
                    <div>Click to browse or drag and drop a ZIP file here</div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '6px' }}>Accepts ZIPs exported by Bulk Update Set Exporter</div>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    style={{ display: 'none' }}
                    onChange={handleFileInput}
                />
                {parseError && (
                    <div className="warning" style={{ marginTop: '12px' }}>{parseError}</div>
                )}
            </div>

            {hasParsed && (
                <>
                    <div className="section">
                        <div className="section-title">
                            Update Sets in ZIP ({parsedUpdateSets.length})
                        </div>
                        <div className="button-group" style={{ marginTop: 0, marginBottom: '12px' }}>
                            <button className="btn btn-secondary" onClick={handleSelectAll}>Select All</button>
                            <button className="btn btn-secondary" onClick={handleDeselectAll}>Deselect All</button>
                        </div>
                        <table className="results-table">
                            <thead>
                                <tr>
                                    <th width="50">Select</th>
                                    <th>Name</th>
                                    <th>Application</th>
                                    <th width="90">Updates</th>
                                    <th>Created By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsedUpdateSets.map(us => (
                                    <tr key={us.remoteUpdateSetSysId}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.includes(us.remoteUpdateSetSysId)}
                                                onChange={(e) => handleRowSelect(us.remoteUpdateSetSysId, e.target.checked)}
                                            />
                                        </td>
                                        <td title={us.name}>{us.name}</td>
                                        <td title={us.application}>{us.application}</td>
                                        <td>{us.updateXmlCount}</td>
                                        <td>{us.createdBy}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="section">
                        <div className="section-title">Import Options</div>
                        <div className="checkbox-item" style={{ marginBottom: '12px' }}>
                            <input
                                type="checkbox"
                                id="createParent"
                                checked={createParent}
                                onChange={(e) => setCreateParent(e.target.checked)}
                            />
                            <label htmlFor="createParent" style={{ fontWeight: 'normal', cursor: 'pointer' }}>
                                Create parent update set. Each selected source set is imported as a child — Preview &amp; Commit the parent to apply all in one step.
                            </label>
                        </div>
                        {createParent && (
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Parent update set name</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={parentName}
                                    onChange={(e) => setParentName(e.target.value)}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '3px', boxSizing: 'border-box' }}
                                />
                            </div>
                        )}

                        <div style={{ marginTop: '16px' }}>
                            <strong>{selectedIds.length}</strong> update set{selectedIds.length !== 1 ? 's' : ''} selected for import.
                        </div>

                        <div className="button-group">
                            <button
                                className="btn btn-success"
                                onClick={handleImport}
                                disabled={selectedIds.length === 0 || isImporting}
                            >
                                {isImporting ? 'Importing...' : `Import ${selectedIds.length} Update Set${selectedIds.length !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>

                    {importResult && (
                        <div className="section">
                            <div className="section-title">Import Result</div>
                            {importResult.success.length > 0 && (
                                <div style={{ color: '#1e7e34', marginBottom: '12px' }}>
                                    ✓ {importResult.success.length} update set{importResult.success.length !== 1 ? 's' : ''} imported successfully.
                                </div>
                            )}
                            {importResult.parentSysId && (
                                <div style={{ marginBottom: '12px' }}>
                                    <a
                                        href={`/sys_remote_update_set.do?sys_id=${importResult.parentSysId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-primary"
                                        style={{ textDecoration: 'none', display: 'inline-block' }}
                                    >
                                        Open "{importResult.parentName}" →
                                    </a>
                                    <div style={{ marginTop: '6px', fontSize: '13px', color: '#555' }}>
                                        Preview &amp; Commit this single record to apply all imported updates in one step.
                                    </div>
                                </div>
                            )}
                            {!importResult.parentSysId && importResult.importedSysIds && importResult.importedSysIds.length > 0 && (
                                <div style={{ marginBottom: '12px' }}>
                                    <a
                                        href={`/sys_remote_update_set_list.do?sysparm_query=sys_idIN${importResult.importedSysIds.join(',')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-primary"
                                        style={{ textDecoration: 'none', display: 'inline-block' }}
                                    >
                                        Open imported update sets
                                    </a>
                                    <div style={{ marginTop: '6px', fontSize: '13px', color: '#555' }}>
                                        Each one needs to be Previewed and Committed individually.
                                    </div>
                                </div>
                            )}
                            {importResult.failed.length > 0 && (
                                <div className="warning">
                                    <strong>{importResult.failed.length} failed:</strong>
                                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px' }}>
                                        {importResult.failed.map((f, i) => (
                                            <li key={i}><strong>{f.name}</strong>: {f.error}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {isImporting && (
                <ProgressModal
                    title={importProgress.name ? `Importing: ${importProgress.name}` : 'Importing Update Sets'}
                    current={importProgress.current}
                    total={importProgress.total}
                />
            )}
        </div>
    );
}
