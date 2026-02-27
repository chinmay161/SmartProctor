import React, { useEffect, useMemo, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import Icon from '../../../components/AppIcon';
import Button from '../../../components/ui/Button';
import { apiRequest } from '../../../services/api';

const APP_ROLE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'admin', label: 'Admin' },
];

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const UserDetailDrawer = ({ userId, open, onClose, onSaved }) => {
  const { getAccessTokenSilently, user: auth0User } = useAuth0();
  const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const [loading, setLoading] = useState(false);
  const [savingRoles, setSavingRoles] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [userDetail, setUserDetail] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);

  const isSelf = Boolean(userId && auth0User?.sub && userId === auth0User.sub);

  const fetchUserDetail = async () => {
    if (!open || !userId) return;
    setLoading(true);
    setDetailError('');
    setActionMessage('');
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: auth0Audience },
      });
      const detail = await apiRequest(`/admin/users/${encodeURIComponent(userId)}`, 'GET', null, token);
      setUserDetail(detail);
      setSelectedRoles(Array.isArray(detail?.roles) ? detail.roles : []);
    } catch (err) {
      setDetailError(String(err?.message || 'Failed to load user details.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserDetail();
  }, [open, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleDiff = useMemo(() => {
    const original = new Set(Array.isArray(userDetail?.roles) ? userDetail.roles : []);
    const selected = new Set(selectedRoles);
    const addRoles = [];
    const removeRoles = [];
    selected.forEach((role) => {
      if (!original.has(role)) addRoles.push(role);
    });
    original.forEach((role) => {
      if (!selected.has(role)) removeRoles.push(role);
    });
    return { addRoles, removeRoles };
  }, [selectedRoles, userDetail]);

  const toggleRole = (role) => {
    setSelectedRoles((prev) => (
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    ));
  };

  const saveRoles = async () => {
    if (!userId) return;
    if (isSelf && roleDiff.removeRoles.includes('admin')) {
      setActionMessage('You cannot remove your own admin role.');
      return;
    }
    setSavingRoles(true);
    setActionMessage('');
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: auth0Audience },
      });
      await apiRequest(
        `/admin/users/${encodeURIComponent(userId)}/roles`,
        'PATCH',
        { add_roles: roleDiff.addRoles, remove_roles: roleDiff.removeRoles },
        token
      );
      setActionMessage('Roles updated successfully.');
      await fetchUserDetail();
      onSaved?.();
    } catch (err) {
      setActionMessage(String(err?.message || 'Failed to update roles.'));
    } finally {
      setSavingRoles(false);
    }
  };

  const toggleStatus = async () => {
    if (!userId || !userDetail) return;
    if (isSelf && !userDetail?.blocked) {
      setActionMessage('You cannot suspend your own account.');
      return;
    }
    setSavingStatus(true);
    setActionMessage('');
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience: auth0Audience },
      });
      await apiRequest(
        `/admin/users/${encodeURIComponent(userId)}/status`,
        'PATCH',
        { blocked: !userDetail?.blocked },
        token
      );
      setActionMessage(userDetail?.blocked ? 'User re-activated.' : 'User suspended.');
      await fetchUserDetail();
      onSaved?.();
    } catch (err) {
      setActionMessage(String(err?.message || 'Failed to update status.'));
    } finally {
      setSavingStatus(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-card shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <div>
            <h3 className="text-lg font-semibold text-foreground">User Details</h3>
            <p className="text-xs text-muted-foreground">{userId}</p>
          </div>
          <button
            type="button"
            className="rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
          >
            <Icon name="X" size={18} />
          </button>
        </div>

        <div className="space-y-6 p-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="Loader2" size={16} className="animate-spin" />
              <span>Loading user details...</span>
            </div>
          )}
          {detailError && !loading && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{detailError}</div>
          )}

          {!loading && userDetail && (
            <>
              <section className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center gap-3">
                  <img
                    src={userDetail?.picture || 'https://via.placeholder.com/64'}
                    alt={userDetail?.name || userDetail?.email || 'User avatar'}
                    className="h-12 w-12 rounded-full border border-border object-cover"
                  />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{userDetail?.name || 'Unnamed User'}</p>
                    <p className="text-xs text-muted-foreground">{userDetail?.email || 'No email'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <p><span className="text-muted-foreground">Nickname:</span> {userDetail?.nickname || 'N/A'}</p>
                  <p><span className="text-muted-foreground">Email Verified:</span> {userDetail?.email_verified ? 'Yes' : 'No'}</p>
                  <p><span className="text-muted-foreground">Created:</span> {formatDateTime(userDetail?.created_at)}</p>
                  <p><span className="text-muted-foreground">Updated:</span> {formatDateTime(userDetail?.updated_at)}</p>
                  <p><span className="text-muted-foreground">Last Login:</span> {formatDateTime(userDetail?.last_login)}</p>
                  <p><span className="text-muted-foreground">Logins:</span> {userDetail?.logins_count ?? 'N/A'}</p>
                </div>
              </section>

              <section className="rounded-lg border border-border p-4">
                <h4 className="mb-3 text-sm font-semibold text-foreground">Account Status</h4>
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${userDetail?.blocked ? 'bg-error/20 text-error' : 'bg-success/20 text-success'}`}>
                    {userDetail?.blocked ? 'Suspended' : 'Active'}
                  </span>
                  {isSelf && <span className="text-xs text-muted-foreground">(Self account protections enabled)</span>}
                </div>
                <Button
                  variant={userDetail?.blocked ? 'success' : 'warning'}
                  size="sm"
                  disabled={savingStatus || (isSelf && !userDetail?.blocked)}
                  loading={savingStatus}
                  onClick={toggleStatus}
                >
                  {userDetail?.blocked ? 'Activate User' : 'Suspend User'}
                </Button>
              </section>

              <section className="rounded-lg border border-border p-4">
                <h4 className="mb-3 text-sm font-semibold text-foreground">Roles</h4>
                <div className="space-y-2">
                  {APP_ROLE_OPTIONS.map((role) => (
                    <label key={role.value} className="flex items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role.value)}
                        onChange={() => toggleRole(role.value)}
                        disabled={isSelf && role.value === 'admin' && selectedRoles.includes('admin')}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span>{role.label}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    loading={savingRoles}
                    disabled={savingRoles || (roleDiff.addRoles.length === 0 && roleDiff.removeRoles.length === 0)}
                    onClick={saveRoles}
                  >
                    Save Roles
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Add: {roleDiff.addRoles.length} | Remove: {roleDiff.removeRoles.length}
                  </span>
                </div>
              </section>

              <section className="rounded-lg border border-border p-4">
                <h4 className="mb-3 text-sm font-semibold text-foreground">App Metadata</h4>
                <div className="mb-3 text-sm">
                  <p><span className="text-muted-foreground">Institution:</span> {userDetail?.app_metadata?.institution || userDetail?.profile?.institution || 'N/A'}</p>
                </div>
                <pre className="max-h-56 overflow-auto rounded bg-muted p-3 text-xs text-foreground">
                  {JSON.stringify(
                    {
                      app_metadata: userDetail?.app_metadata || {},
                      user_metadata: userDetail?.user_metadata || {},
                    },
                    null,
                    2
                  )}
                </pre>
              </section>
            </>
          )}

          {actionMessage && (
            <div className="rounded border border-border bg-muted p-3 text-sm text-foreground">
              {actionMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDetailDrawer;
