import React from 'react';

export default function ExportSection({ selectedCount, onExport, isExporting }) {
    return (
        <div className="section">
            <div className="section-title">Export Selected Update Sets</div>
            
            <div style={{ marginBottom: '15px' }}>
                <strong>{selectedCount}</strong> update set{selectedCount !== 1 ? 's' : ''} selected for export.
            </div>
            
            <button 
                className="btn btn-success" 
                onClick={onExport}
                disabled={selectedCount === 0 || isExporting}
            >
                {isExporting ? 'Exporting...' : 'Export Update Sets'}
            </button>
        </div>
    );
}