import React from 'react';

export default function ResultsSection({
    updateSets,
    selectedUpdateSets,
    setSelectedUpdateSets, 
    recordCount, 
    showWarning 
}) {
    const handleSelectAll = () => {
        const allIds = updateSets.map(us => 
            typeof us.sys_id === 'object' ? us.sys_id.value : us.sys_id
        );
        setSelectedUpdateSets(allIds);
    };

    const handleDeselectAll = () => {
        setSelectedUpdateSets([]);
    };

    const handleRowSelect = (sysId, checked) => {
        if (checked) {
            setSelectedUpdateSets([...selectedUpdateSets, sysId]);
        } else {
            setSelectedUpdateSets(selectedUpdateSets.filter(id => id !== sysId));
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return '';
        
        try {
            const dateValue = typeof dateString === 'object' ? dateString.display_value : dateString;
            const date = new Date(dateValue);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch (error) {
            return dateString;
        }
    };

    return (
        <div className="section">
            <div className="section-title">Search Results</div>
            
            {showWarning && (
                <div className="warning">
                    Showing first 500 of {recordCount} total records – add more filters to narrow results.
                </div>
            )}
            
            <div className="button-group">
                <button 
                    className="btn btn-secondary" 
                    onClick={handleSelectAll}
                >
                    Select All
                </button>
                <button 
                    className="btn btn-secondary" 
                    onClick={handleDeselectAll}
                >
                    Deselect All
                </button>
            </div>
            
            <table className="results-table">
                <thead>
                    <tr>
                        <th width="50">Select</th>
                        <th>Name</th>
                        <th>Application</th>
                        <th>State</th>
                        <th>Created</th>
                        <th>Created By</th>
                        <th>Parent</th>
                        <th>Updated</th>
                    </tr>
                </thead>
                <tbody>
                    {updateSets.map(updateSet => {
                        const sysId = typeof updateSet.sys_id === 'object' ? updateSet.sys_id.value : updateSet.sys_id;
                        const name = typeof updateSet.name === 'object' ? updateSet.name.display_value : updateSet.name;
                        const application = typeof updateSet.application === 'object' ? updateSet.application.display_value : (updateSet.application || '');
                        const state = typeof updateSet.state === 'object' ? updateSet.state.display_value : updateSet.state;
                        const createdOn = typeof updateSet.sys_created_on === 'object' ? updateSet.sys_created_on.display_value : updateSet.sys_created_on;
                        const createdBy = typeof updateSet.created_by === 'object' ? updateSet.created_by.display_value : updateSet.created_by;
                        const parent = typeof updateSet.parent === 'object' ? updateSet.parent.display_value : (updateSet.parent || '');
                        const updatedOn = typeof updateSet.sys_updated_on === 'object' ? updateSet.sys_updated_on.display_value : updateSet.sys_updated_on;
                        
                        return (
                            <tr key={sysId}>
                                <td>
                                    <input
                                        type="checkbox"
                                        checked={selectedUpdateSets.includes(sysId)}
                                        onChange={(e) => handleRowSelect(sysId, e.target.checked)}
                                    />
                                </td>
                                <td title={name}>{name}</td>
                                <td title={application}>{application}</td>
                                <td>{state}</td>
                                <td>{formatDate(createdOn)}</td>
                                <td>{createdBy}</td>
                                <td title={parent}>{parent}</td>
                                <td>{formatDate(updatedOn)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            
            {updateSets.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                    No update sets found matching your criteria.
                </div>
            )}
        </div>
    );
}