import React, { useEffect, useState, useMemo } from 'react';
import { UpdateSetService } from './services/UpdateSetService.js';
import FilterSection from './components/FilterSection.jsx';
import ResultsSection from './components/ResultsSection.jsx';
import ExportSection from './components/ExportSection.jsx';
import ProgressModal from './components/ProgressModal.jsx';
import ImportTab from './components/ImportTab.jsx';
import './app.css';

export default function App() {
    const service = useMemo(() => new UpdateSetService(), []);
    const [activeTab, setActiveTab] = useState('export');

    const [filters, setFilters] = useState({
        states: [],
        createdBy: '',
        nameSearch: ''
    });
    
    const [updateSets, setUpdateSets] = useState([]);
    const [selectedUpdateSets, setSelectedUpdateSets] = useState([]);
    const [hasSearched, setHasSearched] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
    const [recordCount, setRecordCount] = useState(0);
    const [showWarning, setShowWarning] = useState(false);

    const handleSearch = async () => {
        setIsSearching(true);
        try {
            const results = await service.searchUpdateSets(filters);
            setUpdateSets(results.records);
            setRecordCount(results.totalCount);
            setShowWarning(results.records.length >= 500 && results.totalCount > 500);
            
            // Select all by default after search
            const selectedIds = results.records.map(us => 
                typeof us.sys_id === 'object' ? us.sys_id.value : us.sys_id
            );
            setSelectedUpdateSets(selectedIds);
            setHasSearched(true);
        } catch (error) {
            console.error('Search failed:', error);
            alert('Search failed. Please try again.');
        } finally {
            setIsSearching(false);
        }
    };

    const handleClearFilters = () => {
        setFilters({
            states: [],
            createdBy: '',
            nameSearch: ''
        });
        setUpdateSets([]);
        setSelectedUpdateSets([]);
        setHasSearched(false);
        setShowWarning(false);
        setRecordCount(0);
    };

    const handleExport = async () => {
        if (selectedUpdateSets.length === 0) {
            alert('Please select at least one update set to export.');
            return;
        }

        setIsExporting(true);
        setExportProgress({ current: 0, total: selectedUpdateSets.length });

        try {
            const selectedRecords = updateSets.filter(us => {
                const sysId = typeof us.sys_id === 'object' ? us.sys_id.value : us.sys_id;
                return selectedUpdateSets.includes(sysId);
            });

            await service.exportUpdateSets(selectedRecords, (progress) => {
                setExportProgress(progress);
            });
            
            alert('Export completed successfully!');
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        } finally {
            setIsExporting(false);
            setExportProgress({ current: 0, total: 0 });
        }
    };

    return (
        <div className="update-set-bulk-exporter">
            <div className="page-header">
                <h1>Update Set Bulk Exporter</h1>
            </div>

            <div className="tab-bar">
                <button
                    className={activeTab === 'export' ? 'tab active' : 'tab'}
                    onClick={() => setActiveTab('export')}
                >
                    Export
                </button>
                <button
                    className={activeTab === 'import' ? 'tab active' : 'tab'}
                    onClick={() => setActiveTab('import')}
                >
                    Import
                </button>
            </div>

            {activeTab === 'export' && (
                <>
                    <FilterSection
                        filters={filters}
                        setFilters={setFilters}
                        onSearch={handleSearch}
                        onClear={handleClearFilters}
                        isSearching={isSearching}
                    />

                    {hasSearched && (
                        <>
                            <ResultsSection
                                updateSets={updateSets}
                                selectedUpdateSets={selectedUpdateSets}
                                setSelectedUpdateSets={setSelectedUpdateSets}
                                recordCount={recordCount}
                                showWarning={showWarning}
                            />

                            <ExportSection
                                selectedCount={selectedUpdateSets.length}
                                onExport={handleExport}
                                isExporting={isExporting}
                            />
                        </>
                    )}

                    {isExporting && (
                        <ProgressModal
                            title="Exporting Update Sets"
                            current={exportProgress.current}
                            total={exportProgress.total}
                        />
                    )}
                </>
            )}

            {activeTab === 'import' && (
                <ImportTab service={service} />
            )}
        </div>
    );
}