import React from 'react';

export default function ProgressModal({ title, current, total }) {
    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>{title}</h3>
                <div className="progress-bar">
                    <div 
                        className="progress-bar-fill" 
                        style={{ width: `${percentage}%` }}
                    ></div>
                </div>
                <div>
                    {current} of {total} ({percentage}%)
                </div>
            </div>
        </div>
    );
}