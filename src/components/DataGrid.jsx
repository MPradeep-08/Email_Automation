import React, { useState } from 'react';
import { Search, ChevronRight, Inbox, Paperclip, Filter, ChevronDown, ChevronLeft, ArrowUpDown } from 'lucide-react';
import { cn } from '../utils';

export function DataGrid({ tickets, pagination, onPageChange, onRowClick }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  
  // Sort State
  const [sortColumn, setSortColumn] = useState('id'); // 'id' | 'sender' | 'status' | 'date'
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'

  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  // Filter local tickets (then sort them)
  const filteredTickets = tickets.filter(t => {
    const matchesSearch = 
      t.sender_email.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (t.extracted_name && t.extracted_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      t.assigned_department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.email_subject.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Local sorting
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    let fieldA = '', fieldB = '';
    
    if (sortColumn === 'id') {
      fieldA = a.id;
      fieldB = b.id;
    } else if (sortColumn === 'sender') {
      fieldA = a.extracted_name || a.sender_email;
      fieldB = b.extracted_name || b.sender_email;
    } else if (sortColumn === 'status') {
      fieldA = a.status;
      fieldB = b.status;
    } else if (sortColumn === 'date') {
      fieldA = a.timestamp;
      fieldB = b.timestamp;
    }

    if (fieldA < fieldB) return sortDirection === 'asc' ? -1 : 1;
    if (fieldA > fieldB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden flex flex-col h-full">
      {/* Table Header Controls */}
      <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Historical Log</h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">Audit logs of all processed and categorized emails.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Status Filter */}
          <div className="relative flex items-center">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="block w-full sm:w-36 pl-9 pr-8 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors appearance-none cursor-pointer font-medium text-slate-700"
            >
              <option value="All">All Statuses</option>
              <option value="Pending Review">Pending Review</option>
              <option value="Sent">Sent Replies</option>
              <option value="Ignored">Ignored</option>
            </select>
            <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-slate-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Search Box */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search sender, name, route..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full sm:w-56 pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-xs text-slate-700 placeholder-slate-400 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Table grid */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200/60">
            <tr>
              <th 
                scope="col" 
                onClick={() => handleSort('id')}
                className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none"
              >
                <div className="flex items-center gap-1">
                  Ticket ID <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th 
                scope="col" 
                onClick={() => handleSort('sender')}
                className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none"
              >
                <div className="flex items-center gap-1">
                  Sender & Contact <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th 
                scope="col" 
                onClick={() => handleSort('date')}
                className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none"
              >
                <div className="flex items-center gap-1">
                  Route Date <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Category Route</th>
              <th scope="col" className="px-4 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Files</th>
              <th 
                scope="col" 
                onClick={() => handleSort('status')}
                className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors select-none"
              >
                <div className="flex items-center gap-1">
                  Reply Status <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th scope="col" className="relative px-4 py-2.5"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {sortedTickets.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center">
                    <Inbox className="w-8 h-8 text-slate-300 mb-2" />
                    <p className="text-sm font-semibold text-slate-600">No records matching filters</p>
                    <p className="text-xs">Adjust search parameters or ingest a test payload.</p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedTickets.map((ticket) => (
                <tr 
                  key={ticket.id} 
                  onClick={() => onRowClick(ticket)}
                  className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                >
                  {/* ID */}
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-mono font-bold text-indigo-600">
                    {ticket.id}
                  </td>
                  
                  {/* Sender Contact merged */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-[10px] uppercase shrink-0">
                        {ticket.sender_email.charAt(0)}
                      </div>
                      <div className="flex flex-col min-w-0 max-w-[160px]">
                        <span className="text-xs font-bold text-slate-800 truncate">
                          {ticket.extracted_name || 'Unidentified Contact'}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate" title={ticket.sender_email}>
                          {ticket.sender_email}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Route Date */}
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                    {new Date(ticket.timestamp).toLocaleDateString()}
                  </td>
                  
                  {/* Assigned Department */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <DepartmentBadge dept={ticket.assigned_department} />
                  </td>
                  
                  {/* Attachments */}
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    {ticket.attachments && ticket.attachments.length > 0 ? (
                      <span className="inline-flex items-center gap-1 bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold">
                        <Paperclip className="w-3 h-3" />
                        {ticket.attachments.length}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">-</span>
                    )}
                  </td>
                  
                  {/* Status Badge */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={ticket.status} />
                  </td>
                  
                  {/* Action Link indicator */}
                  <td className="px-4 py-3 whitespace-nowrap text-right text-xs font-medium">
                    <div className="flex items-center justify-end gap-1 text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>View</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {pagination && (
        <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 flex items-center justify-between sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="relative inline-flex items-center px-4 py-2 border border-slate-300 text-xs font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-slate-300 text-xs font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-slate-500">
                Showing page <span className="font-semibold text-slate-900">{pagination.page}</span> of <span className="font-semibold text-slate-900">{pagination.totalPages || 1}</span> pages (<span className="font-semibold text-slate-900">{pagination.totalCount}</span> total logs)
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => onPageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="relative inline-flex items-center px-2 py-1.5 rounded-l-md border border-slate-300 bg-white text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onPageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="relative inline-flex items-center px-2 py-1.5 rounded-r-md border border-slate-300 bg-white text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DepartmentBadge({ dept }) {
  const styles = {
    'Sales': 'bg-blue-50 text-blue-700 border-blue-200/50',
    'Technical': 'bg-purple-50 text-purple-700 border-purple-200/50',
    'HR/Internship': 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
    'Billing': 'bg-orange-50 text-orange-700 border-orange-200/50',
    'General': 'bg-slate-50 text-slate-700 border-slate-200/50'
  };
  
  const style = styles[dept] || styles['General'];
  
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border", style)}>
      {dept}
    </span>
  );
}

export function StatusBadge({ status }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border",
      status === 'Pending Review' && "bg-amber-50 text-amber-700 border-amber-200/80 animate-pulse",
      status === 'Sent' && "bg-emerald-50 text-emerald-700 border-emerald-200/80",
      status === 'Ignored' && "bg-slate-100 text-slate-500 border-slate-200/80"
    )}>
      {status === 'Pending Review' && (
        <span className="w-1 h-1 mr-1 rounded-full bg-amber-500"></span>
      )}
      {status === 'Sent' && (
        <span className="w-1 h-1 mr-1 rounded-full bg-emerald-500"></span>
      )}
      {status === 'Ignored' && (
        <span className="w-1 h-1 mr-1 rounded-full bg-slate-400"></span>
      )}
      {status === 'Pending Review' ? 'Awaiting Approval' : status}
    </span>
  );
}
