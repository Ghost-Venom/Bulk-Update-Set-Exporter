import JSZip from 'jszip';

export class UpdateSetService {
    constructor() {
        this.tableName = "sys_update_set";
        this.choiceTableName = "sys_choice";
    }

    // Get state choices for the update set table
    async getStateChoices() {
        try {
            const encodedQuery = "name=sys_update_set^element=state^inactive=false";
            const response = await fetch(`/api/now/table/${this.choiceTableName}?sysparm_query=${encodedQuery}&sysparm_display_value=all&sysparm_fields=label,value,sequence`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "X-UserToken": window.g_ck
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to fetch state choices');
            }

            const { result } = await response.json();
            console.log('State choices loaded:', result);
            return result ? result.sort((a, b) => parseInt(a.sequence || 0) - parseInt(b.sequence || 0)) : [];
        } catch (error) {
            console.error('Error fetching state choices:', error);
            throw error;
        }
    }

    // Search for users for the created_by lookup
    async searchUsers(searchTerm) {
        try {
            if (!searchTerm || searchTerm.length < 2) {
                return [];
            }

            const encodedQuery = `nameLIKE${searchTerm}^ORfirst_nameLIKE${searchTerm}^ORlast_nameLIKE${searchTerm}^ORuser_nameLIKE${searchTerm}^active=true`;
            const response = await fetch(`/api/now/table/sys_user?sysparm_query=${encodedQuery}&sysparm_limit=20&sysparm_fields=sys_id,name,user_name&sysparm_display_value=all`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "X-UserToken": window.g_ck
                },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to search users');
            }

            const { result } = await response.json();
            return result || [];
        } catch (error) {
            console.error('Error searching users:', error);
            throw error;
        }
    }

    // Search update sets based on filters
    async searchUpdateSets(filters) {
        try {
            const encodedQuery = [];

            if (filters.states && filters.states.length > 0) {
                encodedQuery.push(`stateIN${filters.states.join(',')}`);
            }

            if (filters.createdBy) {
                encodedQuery.push(`sys_created_by=${filters.createdBy}`);
            }

            if (filters.nameSearch) {
                encodedQuery.push(`nameLIKE${filters.nameSearch}`);
            }

            const queryString = encodedQuery.join('^');

            const params = new URLSearchParams({
                sysparm_query: queryString,
                sysparm_limit: '1000',
                sysparm_display_value: 'all',
                sysparm_fields: 'sys_id,name,application,state,sys_created_on,created_by,parent,sys_updated_on,description',
                sysparm_order: 'ORDERBYDESCsys_updated_on'
            });

            const countParams = new URLSearchParams({
                sysparm_count: 'true',
                sysparm_query: queryString
            });

            const [countResponse, response] = await Promise.all([
                fetch(`/api/now/stats/${this.tableName}?${countParams}`, {
                    method: 'GET',
                    headers: { Accept: 'application/json', 'X-UserToken': window.g_ck },
                }),
                fetch(`/api/now/table/${this.tableName}?${params}`, {
                    method: 'GET',
                    headers: { Accept: 'application/json', 'X-UserToken': window.g_ck },
                }),
            ]);

            let totalCount = 0;
            if (countResponse.ok) {
                const countData = await countResponse.json();
                totalCount = parseInt(countData.result?.stats?.count || 0);
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Failed to search update sets');
            }

            const { result } = await response.json();

            this.logActivity('search', {
                filters,
                resultCount: result ? result.length : 0,
                totalCount,
            });

            return {
                records: result || [],
                totalCount,
            };
        } catch (error) {
            console.error('Error searching update sets:', error);
            throw error;
        }
    }

    // Helper function to safely extract field values
    extractValue(field, defaultValue = '') {
        if (field === null || field === undefined) {
            return defaultValue;
        }
        if (typeof field === 'object' && field.display_value !== undefined) {
            return field.display_value || defaultValue;
        }
        if (typeof field === 'object' && field.value !== undefined) {
            return field.value || defaultValue;
        }
        return field || defaultValue;
    }

    // Like extractValue, but prefers the raw .value over .display_value. Use
    // for XML *reference* fields (e.g. <application>global</application>) where
    // the receiving instance looks up the referenced record by sys_id / value
    // and cannot resolve a display name like "Global".
    extractRawValue(field, defaultValue = '') {
        if (field === null || field === undefined) {
            return defaultValue;
        }
        if (typeof field === 'object' && field.value !== undefined) {
            return field.value || defaultValue;
        }
        if (typeof field === 'object' && field.display_value !== undefined) {
            return field.display_value || defaultValue;
        }
        return field || defaultValue;
    }

    // Export selected update sets
    async exportUpdateSets(updateSets, progressCallback) {
        try {
            const instanceName = await this.getInstanceName();
            const now = new Date();
            const timestamp = now.toISOString().replace(/[-T:\.Z]/g, '').slice(0, 12);
            const zipFilename = `${instanceName}_Bulk_Update_Sets_Export_${timestamp}.zip`;
            
            const zip = new JSZip();
            let manifestData = [];
            let currentUser = await this.getCurrentUser();
            
            // Add CSV header
            manifestData.push(['UpdateSetName', 'SysID', 'OriginalState', 'CreatedBy', 'Application', 'ExportDateTime', 'ExportedBy', 'TotalExported']);

            for (let i = 0; i < updateSets.length; i++) {
                const updateSet = updateSets[i];
                progressCallback({ current: i + 1, total: updateSets.length });

                try {
                    const sysId = this.extractValue(updateSet.sys_id);
                    const name = this.extractValue(updateSet.name, 'Unnamed_Update_Set');
                    const state = this.extractValue(updateSet.state, 'unknown');
                    const createdBy = this.extractValue(updateSet.created_by, 'Unknown User');
                    const application = this.extractValue(updateSet.application, 'No Application');
                    
                    // Try ServiceNow's native export first
                    let xmlContent;
                    try {
                        xmlContent = await this.exportUpdateSetNative(sysId);
                    } catch (exportError) {
                        console.warn('Native export failed, using fallback:', exportError);
                        xmlContent = await this.exportUpdateSetFallback(sysId);
                    }
                    
                    // Create unique filename: name + sys_id to prevent collisions
                    const uniqueFilename = `${this.sanitizeFilename(name)}_${sysId}.xml`;
                    
                    // Add file to ZIP
                    zip.file(uniqueFilename, xmlContent);

                    // Add to manifest - ensure all values are strings
                    manifestData.push([
                        String(name),
                        String(sysId),
                        String(state),
                        String(createdBy),
                        String(application),
                        now.toISOString(),
                        String(currentUser),
                        String(updateSets.length)
                    ]);
                } catch (error) {
                    console.error(`Failed to export update set:`, error);
                    // Continue with other exports
                }
            }

            // Create manifest CSV
            const manifestCSV = manifestData.map(row => 
                row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
            ).join('\n');
            
            // Add manifest to ZIP
            zip.file('manifest.csv', manifestCSV);

            // Generate ZIP and download
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = zipFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Log the export
            this.logActivity('export', {
                updateSetCount: updateSets.length,
                success: true
            });

        } catch (error) {
            console.error('Error during export:', error);
            this.logActivity('export', {
                updateSetCount: updateSets.length,
                success: false,
                error: error.message
            });
            throw error;
        }
    }

    // Try ServiceNow's native export mechanism
    async exportUpdateSetNative(sysId) {
        const exportUrls = [
            `/sys_remote_update_set.do?XML&sysparm_sys_id=${sysId}`,
            `/${sysId}.xml`,
            `/sys_update_set.do?XML&sysparm_sys_id=${sysId}`,
            `/api/now/export/sys_update_set/${sysId}`
        ];

        for (const url of exportUrls) {
            try {
                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        "Accept": "application/xml, text/xml",
                        "X-UserToken": window.g_ck
                    },
                });

                if (response.ok) {
                    const xmlContent = await response.text();
                    if (xmlContent.includes('<unload') && xmlContent.includes('sys_update_xml')) {
                        return xmlContent;
                    }
                }
            } catch (error) {
                continue;
            }
        }

        throw new Error('All native export methods failed');
    }

    // Fallback: Create proper export XML with sys_update_xml records
    async exportUpdateSetFallback(sysId) {
        try {
            const updateSetResponse = await fetch(`/api/now/table/sys_update_set/${sysId}?sysparm_display_value=all`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "X-UserToken": window.g_ck
                },
            });

            if (!updateSetResponse.ok) {
                throw new Error('Failed to fetch update set record');
            }

            const { result: updateSetRecord } = await updateSetResponse.json();

            const updatesResponse = await fetch(`/api/now/table/sys_update_xml?sysparm_query=update_set=${sysId}&sysparm_display_value=all&sysparm_limit=1000`, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "X-UserToken": window.g_ck
                },
            });

            let updateXmlRecords = [];
            if (updatesResponse.ok) {
                const { result } = await updatesResponse.json();
                updateXmlRecords = result || [];
            }

            return this.generateCompleteExportXML(updateSetRecord, updateXmlRecords);

        } catch (error) {
            console.error('Fallback export failed:', error);
            throw error;
        }
    }

    // Generate complete ServiceNow-style export XML
    generateCompleteExportXML(updateSetRecord, updateXmlRecords) {
        const now = new Date();
        const unloadDate = now.toISOString().replace('T', ' ').split('.')[0];

        // sys_update_xml.remote_update_set must reference the sys_remote_update_set
        // record's local sys_id on the receiving instance (this freshly generated UUID),
        // not the source instance's sys_update_set sys_id (which is remote_sys_id).
        const remoteUpdateSetSysId = this.generateUUID();

        let xml = `<?xml version="1.0" encoding="UTF-8"?><unload unload_date="${unloadDate}">\n`;

        xml += '<sys_remote_update_set action="INSERT_OR_UPDATE">\n';
        xml += `<application display_value="${this.escapeXml(this.extractValue(updateSetRecord.application, 'Global'))}">${this.escapeXml(this.extractRawValue(updateSetRecord.application, 'global'))}</application>\n`;
        xml += `<application_name>${this.escapeXml(this.extractValue(updateSetRecord.application, 'Global'))}</application_name>\n`;
        xml += `<application_scope>${this.escapeXml(this.extractRawValue(updateSetRecord.application, 'global'))}</application_scope>\n`;
        xml += '<application_version/>\n';
        xml += '<collisions/>\n';
        xml += '<commit_date/>\n';
        xml += '<deleted/>\n';
        xml += `<description>${this.escapeXml(this.extractValue(updateSetRecord.description))}</description>\n`;
        xml += '<inserted/>\n';
        xml += `<name>${this.escapeXml(this.extractValue(updateSetRecord.name))}</name>\n`;
        xml += '<origin_sys_id/>\n';
        xml += `<parent display_value="${this.escapeXml(this.extractValue(updateSetRecord.parent))}"/>\n`;
        xml += '<release_date/>\n';
        xml += '<remote_base_update_set display_value=""/>\n';
        xml += '<remote_parent_id/>\n';
        xml += `<remote_sys_id>${this.extractValue(updateSetRecord.sys_id)}</remote_sys_id>\n`;
        xml += '<state>loaded</state>\n';
        xml += '<summary/>\n';
        xml += '<sys_class_name>sys_remote_update_set</sys_class_name>\n';
        xml += `<sys_created_by>${this.escapeXml(this.extractValue(updateSetRecord.created_by, 'admin'))}</sys_created_by>\n`;
        xml += `<sys_created_on>${unloadDate}</sys_created_on>\n`;
        xml += `<sys_id>${remoteUpdateSetSysId}</sys_id>\n`;
        xml += '<sys_mod_count>0</sys_mod_count>\n';
        xml += `<sys_updated_by>${this.escapeXml(this.extractValue(updateSetRecord.created_by, 'admin'))}</sys_updated_by>\n`;
        xml += `<sys_updated_on>${unloadDate}</sys_updated_on>\n`;
        xml += '<update_set display_value=""/>\n';
        xml += '<update_source display_value=""/>\n';
        xml += '<updated/>\n';
        xml += '</sys_remote_update_set>\n';

        updateXmlRecords.forEach(updateXml => {
            xml += '<sys_update_xml action="INSERT_OR_UPDATE">\n';
            xml += `<action>${this.escapeXml(this.extractValue(updateXml.action, 'INSERT_OR_UPDATE'))}</action>\n`;
            xml += `<application display_value="${this.escapeXml(this.extractValue(updateXml.application, 'Global'))}">${this.escapeXml(this.extractRawValue(updateXml.application, 'global'))}</application>\n`;
            xml += `<category>${this.escapeXml(this.extractValue(updateXml.category, 'customer'))}</category>\n`;
            xml += `<comments>${this.escapeXml(this.extractValue(updateXml.comments))}</comments>\n`;
            xml += `<name>${this.escapeXml(this.extractValue(updateXml.name))}</name>\n`;
            
            // Entity-encode the payload instead of wrapping in CDATA. Customer-update
            // payloads frequently contain inner <![CDATA[…]]> blocks (script includes,
            // business rules, UI scripts), and CDATA cannot nest — the inner ]]>
            // would close the outer section and corrupt the XML.
            const payload = this.extractValue(updateXml.payload);
            if (payload) {
                xml += `<payload>${this.escapeXml(payload)}</payload>\n`;
            } else {
                xml += '<payload/>\n';
            }
            
            xml += `<payload_hash>${this.extractValue(updateXml.payload_hash, '0')}</payload_hash>\n`;
            xml += `<remote_update_set display_value="${this.escapeXml(this.extractValue(updateSetRecord.name))}">${remoteUpdateSetSysId}</remote_update_set>\n`;
            xml += '<replace_on_upgrade>false</replace_on_upgrade>\n';
            xml += `<sys_created_by>${this.escapeXml(this.extractValue(updateXml.sys_created_by, 'admin'))}</sys_created_by>\n`;
            xml += `<sys_created_on>${this.extractValue(updateXml.sys_created_on, unloadDate)}</sys_created_on>\n`;
            xml += `<sys_id>${this.extractValue(updateXml.sys_id, this.generateUUID())}</sys_id>\n`;
            xml += `<sys_mod_count>${this.extractValue(updateXml.sys_mod_count, '0')}</sys_mod_count>\n`;
            xml += `<sys_recorded_at>${this.extractValue(updateXml.sys_recorded_at, '')}</sys_recorded_at>\n`;
            xml += `<sys_updated_by>${this.escapeXml(this.extractValue(updateXml.sys_updated_by, 'admin'))}</sys_updated_by>\n`;
            xml += `<sys_updated_on>${this.extractValue(updateXml.sys_updated_on, unloadDate)}</sys_updated_on>\n`;
            xml += `<table>${this.escapeXml(this.extractValue(updateXml.table))}</table>\n`;
            xml += `<target_name>${this.escapeXml(this.extractValue(updateXml.target_name))}</target_name>\n`;
            xml += `<type>${this.escapeXml(this.extractValue(updateXml.type))}</type>\n`;
            xml += `<update_domain>${this.escapeXml(this.extractValue(updateXml.update_domain, 'global'))}</update_domain>\n`;
            xml += `<update_guid>${this.extractValue(updateXml.update_guid)}</update_guid>\n`;
            xml += `<update_guid_history>${this.extractValue(updateXml.update_guid_history)}</update_guid_history>\n`;
            xml += '<update_set display_value=""/>\n';
            xml += `<view>${this.escapeXml(this.extractValue(updateXml.view))}</view>\n`;
            xml += '</sys_update_xml>\n';
        });

        xml += '</unload>';
        return xml;
    }

    generateUUID() {
        return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[x]/g, () => 
            (Math.random() * 16 | 0).toString(16)
        );
    }

    escapeXml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    async getCurrentUser() {
        try {
            const response = await fetch('/api/now/table/sys_user?sysparm_query=user_name=javascript:gs.getUserName()&sysparm_fields=name&sysparm_limit=1', {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "X-UserToken": window.g_ck
                },
            });

            if (response.ok) {
                const { result } = await response.json();
                if (result && result.length > 0) {
                    return this.extractValue(result[0].name, 'Current User');
                }
            }
            
            return 'Current User';
        } catch (error) {
            console.error('Error getting current user:', error);
            return 'Current User';
        }
    }

    async getInstanceName() {
        try {
            const response = await fetch('/api/now/table/sys_properties?sysparm_query=name=instance_name^ORname=glide.instance_name&sysparm_fields=value&sysparm_limit=1', {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "X-UserToken": window.g_ck
                },
            });

            if (response.ok) {
                const { result } = await response.json();
                if (result && result.length > 0) {
                    return result[0].value || 'ServiceNow';
                }
            }
            
            return 'ServiceNow';
        } catch (error) {
            console.error('Error getting instance name:', error);
            return 'ServiceNow';
        }
    }

    sanitizeFilename(filename) {
        return String(filename || 'update_set').replace(/[/\\:*?"<>|]/g, '_');
    }

    logActivity(action, details) {
        try {
            const logData = {
                source: 'Bulk Update Set Exporter',
                action: action,
                timestamp: new Date().toISOString(),
                details: JSON.stringify(details)
            };
            
            console.log('Update Set Bulk Exporter Activity:', logData);
            
        } catch (error) {
            console.error('Error logging activity:', error);
        }
    }
}