import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import Select from '../../../components/ui/Select';
import { apiRequest } from '../../../services/api';
import UserDetailDrawer from './UserDetailDrawer';

const ROLE_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'admin', label: 'Administrators' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

const formatTimestamp = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const roleBadgeClass = (role) => {
  switch (role) {
    case 'admin':
      return 'bg-error/20 text-error';
    case 'teacher':
      return 'bg-primary/20 text-primary';
    case 'student':
      return 'bg-success/20 text-success';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

const UserManagementTable = () => {
  const { getAccessTokenSilently, user: auth0User } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [drawerUserId, setDrawerUserId] = useState(null);

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim().length >= 3) params.set('email', searchQuery.trim());
      params.set('page', String(page));
      params.set('page_size', String(pageSize));
      params.set('role', roleFilter);
      params.set('status', statusFilter);

      const token = await getAccessTokenSilently({
        authorizationParams: { audience: auth0Audience },
      });
      const resp = await apiRequest(`/admin/users?${params.toString()}`, 'GET', null, token);
      setUsers(resp?.items || []);
      setTotalUsers(Number(resp?.total || 0));
      setSelectedUsers([]);
    } catch (err) {
      const message = String(err?.message || '');
      if (message.includes('403') || message.toLowerCase().includes('insufficient permissions')) {
        setFetchError('You do not have permission to view users.');
      } else {
        setFetchError(message || 'Failed to load users. Please refresh.');
      }
      setUsers([]);
      setTotalUsers(0);
      setSelectedUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [auth0Audience, getAccessTokenSilently, page, pageSize, roleFilter, searchQuery, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, roleFilter, statusFilter]);

  const selectedUserRows = useMemo(
    () => users.filter((u) => selectedUsers.includes(u.user_id)),
    [selectedUsers, users]
  );

  const toggleUserSelection = (userId) => {
    setSelectedUsers((prev) => (
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    ));
  };

  const toggleSelectAll = () => {
    if (selectedUsers.length === users.length && users.length > 0) {
      setSelectedUsers([]);
      return;
    }
    setSelectedUsers(users.map((u) => u.user_id));
  };

  const runBulkStatusUpdate = async (blocked, confirmMessage) => {
    if (selectedUsers.length === 0) return;
    if (!window.confirm(confirmMessage)) return;
    setIsBulkLoading(true);
    setActionMessage('');
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: auth0Audience },
      });
      const resp = await apiRequest(
        '/admin/users/bulk/status',
        'POST',
        { user_ids: selectedUsers, blocked },
        token
      );
      const successCount = Array.isArray(resp?.updated) ? resp.updated.length : 0;
      const failureCount = Array.isArray(resp?.failed) ? resp.failed.length : 0;
      setActionMessage(`Bulk update complete. Updated: ${successCount}, Failed: ${failureCount}.`);
      await fetchUsers();
    } catch (err) {
      setActionMessage(String(err?.message || 'Bulk update failed.'));
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleSendEmail = () => {
    const emails = selectedUserRows.map((u) => u.email).filter(Boolean);
    if (emails.length === 0) {
      setActionMessage('No email addresses available for selected users.');
      return;
    }
    const mailto = `mailto:${encodeURIComponent(emails.join(','))}?subject=${encodeURIComponent('SmartProctor Admin Notification')}`;
    window.location.href = mailto;
  };

  const handleSingleSoftDelete = async (user) => {
    if (!user?.user_id) return;
    if (user.user_id === auth0User?.sub) {
      setActionMessage('You cannot suspend your own account.');
      return;
    }
    const confirmed = window.confirm('This will suspend the account (soft delete). Continue?');
    if (!confirmed) return;
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: auth0Audience },
      });
      await apiRequest(
        `/admin/users/${encodeURIComponent(user.user_id)}/status`,
        'PATCH',
        { blocked: true },
        token
      );
      setActionMessage('User suspended successfully.');
      await fetchUsers();
    } catch (err) {
      setActionMessage(String(err?.message || 'Failed to suspend user.'));
    }
  };

  const tableStart = totalUsers === 0 ? 0 : (page - 1) * pageSize + 1;
  const tableEnd = Math.min(totalUsers, page * pageSize);

  return (
    <div className="bg-card border border-border rounded-lg shadow-md overflow-hidden">
      <div className="p-4 md:p-6 border-b border-border">
        {fetchError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{fetchError}</p>
          </div>
        )}
        {actionMessage && (
          <div className="mb-4 p-3 bg-muted border border-border rounded-lg">
            <p className="text-sm text-foreground">{actionMessage}</p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          <div className="flex-1 min-w-0">
            <Input
              type="search"
              placeholder="Search by email (min 3 chars)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e?.target?.value || '')}
              className="w-full"
            />
          </div>

          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <Select
              options={ROLE_OPTIONS}
              value={roleFilter}
              onChange={setRoleFilter}
              placeholder="Filter by role"
              className="w-full sm:w-44"
            />
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="Filter by status"
              className="w-full sm:w-44"
            />
          </div>
        </div>

        {selectedUsers.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{selectedUsers.length} selected</span>
            <Button variant="outline" size="sm" iconName="Mail" onClick={handleSendEmail}>
              Send Email
            </Button>
            <Button
              variant="outline"
              size="sm"
              iconName="UserX"
              loading={isBulkLoading}
              onClick={() => runBulkStatusUpdate(true, 'Suspend selected users?')}
            >
              Suspend
            </Button>
            <Button
              variant="destructive"
              size="sm"
              iconName="Trash2"
              loading={isBulkLoading}
              onClick={() => runBulkStatusUpdate(true, 'Soft delete selected users? This will suspend their accounts.')}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={users.length > 0 && selectedUsers.length === users.length}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-border"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">User</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Roles</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Institution</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Login</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user?.user_id} className="hover:bg-muted/30 transition-smooth">
                <td className="px-4 py-4">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user?.user_id)}
                    onChange={() => toggleUserSelection(user?.user_id)}
                    className="w-4 h-4 rounded border-border"
                  />
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                      <Icon name="User" size={20} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{user?.name || 'Unnamed User'}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email || 'No email'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap items-center gap-1">
                    {(user?.roles || []).length === 0 && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                        No roles
                      </span>
                    )}
                    {(user?.roles || []).map((role) => (
                      <span
                        key={`${user.user_id}-${role}`}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${roleBadgeClass(role)}`}
                      >
                        {role}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm text-foreground">{user?.institution || 'N/A'}</p>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-xs font-medium ${user?.blocked ? 'bg-error/20 text-error' : 'bg-success/20 text-success'}`}>
                    <Icon name={user?.blocked ? 'XCircle' : 'CheckCircle'} size={12} />
                    <span>{user?.blocked ? 'Suspended' : 'Active'}</span>
                  </span>
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm text-muted-foreground font-caption">{formatTimestamp(user?.last_login)}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center space-x-2">
                    <button
                      className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-smooth"
                      onClick={() => setDrawerUserId(user?.user_id)}
                      title="Edit user"
                    >
                      <Icon name="Edit" size={16} />
                    </button>
                    <button
                      className="p-1.5 text-muted-foreground hover:text-error hover:bg-error/10 rounded transition-smooth"
                      onClick={() => handleSingleSoftDelete(user)}
                      title="Soft delete (suspend) user"
                    >
                      <Icon name="Trash2" size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && !isLoading && (
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="Users" size={32} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No users found matching your criteria</p>
        </div>
      )}

      <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between space-y-2 sm:space-y-0">
        <p className="text-sm text-muted-foreground">
          Showing {tableStart}-{tableEnd} of {totalUsers} users
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            iconName="ChevronLeft"
            disabled={isLoading || page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            iconName="ChevronRight"
            iconPosition="right"
            disabled={isLoading || page >= totalPages}
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          >
            Next
          </Button>
        </div>
      </div>

      <UserDetailDrawer
        userId={drawerUserId}
        open={Boolean(drawerUserId)}
        onClose={() => setDrawerUserId(null)}
        onSaved={fetchUsers}
      />
    </div>
  );
};

export default UserManagementTable;
