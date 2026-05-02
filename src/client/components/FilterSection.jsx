import React, { useState, useEffect } from 'react';
import { UpdateSetService } from '../services/UpdateSetService.js';
import './FilterSection.css';

export default function FilterSection({ filters, setFilters, onSearch, onClear, isSearching }) {
    const [stateChoices, setStateChoices] = useState([]);
    const [userSearch, setUserSearch] = useState('');
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const service = new UpdateSetService();

    useEffect(() => {
        // Load state choices
        service.getStateChoices().then(setStateChoices).catch(console.error);
    }, []);

    useEffect(() => {
        // Search users when userSearch changes
        if (userSearch.length >= 2) {
            service.searchUsers(userSearch).then(setUsers).catch(console.error);
        } else {
            setUsers([]);
        }
    }, [userSearch]);

    const handleStateChange = (stateValue, checked) => {
        console.log('State checkbox changed:', stateValue, checked); // Debug log
        const newStates = checked 
            ? [...filters.states, stateValue]
            : filters.states.filter(s => s !== stateValue);
        
        console.log('New states:', newStates); // Debug log
        setFilters({ ...filters, states: newStates });
    };

    const handleUserSelect = (user) => {
        const userName = typeof user.name === 'object' ? user.name.display_value : user.name;
        const userLogin = typeof user.user_name === 'object' ? user.user_name.value : user.user_name;

        setSelectedUser(user);
        setUserSearch(userName);
        setUsers([]);
        // Send the username string — it matches sys_created_by on sys_update_set.
        setFilters({ ...filters, createdBy: userLogin });
    };

    const handleClear = () => {
        setUserSearch('');
        setSelectedUser(null);
        setUsers([]);
        onClear();
    };

    return (
        <div className="section">
            <div className="section-title">Filter Update Sets</div>
            
            <div className="filter-row">
                <div className="filter-column">
                    <div className="form-group">
                        <label>State:</label>
                        <div className="checkbox-group">
                            {stateChoices.map(choice => {
                                // Extract the actual state value (often numeric like -5, 1, 2, 3)
                                const value = typeof choice.value === 'object' ? choice.value.value : choice.value;
                                const label = typeof choice.label === 'object' ? choice.label.display_value : choice.label;
                                
                                console.log('State choice:', { value, label }); // Debug log
                                
                                return (
                                    <div key={value} className="checkbox-item">
                                        <input
                                            type="checkbox"
                                            id={`state_${value}`}
                                            checked={filters.states.includes(value)}
                                            onChange={(e) => handleStateChange(value, e.target.checked)}
                                        />
                                        <label htmlFor={`state_${value}`}>{label}</label>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
                
                <div className="filter-column">
                    <div className="form-group">
                        <label htmlFor="createdBy">Created By:</label>
                        <div className="user-lookup">
                            <input
                                type="text"
                                id="createdBy"
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                                placeholder="Start typing name..."
                            />
                            {users.length > 0 && (
                                <div className="user-dropdown">
                                    {users.map(user => {
                                        const userId = typeof user.sys_id === 'object' ? user.sys_id.value : user.sys_id;
                                        const userName = typeof user.name === 'object' ? user.name.display_value : user.name;
                                        const userLogin = typeof user.user_name === 'object' ? user.user_name.display_value : user.user_name;
                                        
                                        return (
                                            <div 
                                                key={userId} 
                                                className="user-option"
                                                onClick={() => handleUserSelect(user)}
                                            >
                                                {userName} ({userLogin})
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="filter-column">
                    <div className="form-group">
                        <label htmlFor="nameSearch">Name Contains:</label>
                        <input
                            type="text"
                            id="nameSearch"
                            value={filters.nameSearch}
                            onChange={(e) => setFilters({ ...filters, nameSearch: e.target.value })}
                            placeholder="Update set name..."
                        />
                    </div>
                </div>
            </div>
            
            <div className="button-group">
                <button 
                    className="btn btn-primary" 
                    onClick={onSearch}
                    disabled={isSearching}
                >
                    {isSearching ? 'Searching...' : 'Search'}
                </button>
                <button 
                    className="btn btn-secondary" 
                    onClick={handleClear}
                    disabled={isSearching}
                >
                    Clear Filters
                </button>
            </div>
            
            {/* Debug info */}
            <div style={{ fontSize: '11px', color: '#666', marginTop: '10px' }}>
                Current filter states: {JSON.stringify(filters.states)}
            </div>
        </div>
    );
}