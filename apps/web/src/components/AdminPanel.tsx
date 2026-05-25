import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '../store/index.js';
import { Shield, Users, RefreshCw, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

const ROLES = ['admin', 'developer', 'reviewer', 'viewer'] as const;
type Role = typeof ROLES[number];

const ROLE_COLORS: Record<Role, string> = {
  admin: 'rgba(99,102,241,0.15)',
  developer: 'rgba(16,185,129,0.15)',
  reviewer: 'rgba(245,158,11,0.15)',
  viewer: 'rgba(148,163,184,0.15)',
};
const ROLE_TEXT: Record<Role, string> = {
  admin: '#818cf8',
  developer: '#34d399',
  reviewer: '#fbbf24',
  viewer: '#94a3b8',
};

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function AdminPanel() {
  const { user } = useAppStore();
  const [userList, setUserList] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // userId being patched

  const apiFetch = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('arp_token');
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    return res;
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/users');
      const json = await res.json();
      if (json.success) {
        setUserList(json.data);
      } else {
        setError(json.error ?? 'Failed to fetch users');
      }
    } catch (err: any) {
      setError(err.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const patchUser = async (userId: string, updates: { role?: Role; isActive?: boolean }) => {
    setSaving(userId);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (json.success) {
        setUserList(prev =>
          prev.map(u => (u.id === userId ? { ...u, ...json.data } : u)),
        );
      } else {
        setError(json.error ?? 'Update failed');
      }
    } catch (err: any) {
      setError(err.message ?? 'Network error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
      {/* Header */}
      <div style={{
        padding: '24px 32px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(99,102,241,0.15)',
              border: '1px solid rgba(99,102,241,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Shield size={18} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                User Management
              </h1>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Manage roles and access for all accounts
              </p>
            </div>
          </div>
          <button
            id="admin-refresh-users"
            onClick={fetchUsers}
            disabled={loading}
            className="btn-ghost"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: '13px',
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {/* Error */}
        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 16px',
            borderRadius: '8px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            color: '#f87171',
            marginBottom: '20px',
            fontSize: '13px',
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px' }}
            >×</button>
          </div>
        )}

        {/* Stats bar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          {(['admin', 'developer', 'reviewer', 'viewer'] as Role[]).map(role => {
            const cnt = userList.filter(u => u.role === role).length;
            return (
              <div key={role} style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 600 }}>{role}</span>
                <span style={{ fontSize: '22px', fontWeight: 700, color: ROLE_TEXT[role] }}>{cnt}</span>
              </div>
            );
          })}
        </div>

        {/* Users Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
            <RefreshCw size={20} style={{ marginBottom: '8px', opacity: 0.5 }} className="animate-spin" />
            <div>Loading users...</div>
          </div>
        ) : userList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
            <Users size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <div>No users found</div>
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-panel)',
            borderRadius: '12px',
            border: '1px solid var(--border)',
            overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 160px 120px 80px',
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-primary)',
            }}>
              {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
                <span key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>

            {/* Table rows */}
            {userList.map((u, idx) => {
              const isSelf = u.id === user?.id;
              const isSaving = saving === u.id;
              return (
                <div
                  key={u.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 160px 120px 80px',
                    padding: '14px 20px',
                    alignItems: 'center',
                    borderBottom: idx < userList.length - 1 ? '1px solid var(--border)' : 'none',
                    background: isSelf ? 'rgba(99,102,241,0.04)' : 'transparent',
                    transition: 'background 0.15s ease',
                    opacity: isSaving ? 0.6 : 1,
                  }}
                  className="admin-user-row"
                >
                  {/* Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${ROLE_COLORS[u.role as Role] || 'rgba(99,102,241,0.15)'}, rgba(99,102,241,0.05))`,
                      border: '1px solid var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      flexShrink: 0,
                    }}>
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {u.name} {isSelf && <span style={{ fontSize: '10px', color: 'var(--accent-primary)', fontWeight: 700 }}>(you)</span>}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{u.email}</span>

                  {/* Role dropdown */}
                  <select
                    id={`admin-role-select-${u.id}`}
                    value={u.role}
                    disabled={isSelf || isSaving}
                    onChange={e => patchUser(u.id, { role: e.target.value as Role })}
                    style={{
                      background: ROLE_COLORS[u.role as Role] ?? 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      fontSize: '12px',
                      color: ROLE_TEXT[u.role as Role] ?? 'var(--text-primary)',
                      fontWeight: 600,
                      cursor: isSelf ? 'not-allowed' : 'pointer',
                      width: '130px',
                      outline: 'none',
                    }}
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r} style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>{r}</option>
                    ))}
                  </select>

                  {/* Active status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {u.isActive ? (
                      <CheckCircle2 size={14} style={{ color: '#34d399' }} />
                    ) : (
                      <XCircle size={14} style={{ color: '#f87171' }} />
                    )}
                    <span style={{ fontSize: '12px', color: u.isActive ? '#34d399' : '#f87171', fontWeight: 500 }}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      id={`admin-toggle-active-${u.id}`}
                      disabled={isSelf || isSaving}
                      onClick={() => patchUser(u.id, { isActive: !u.isActive })}
                      title={u.isActive ? 'Deactivate account' : 'Activate account'}
                      style={{
                        background: u.isActive ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                        border: u.isActive ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(16,185,129,0.25)',
                        borderRadius: '6px',
                        padding: '5px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: u.isActive ? '#f87171' : '#34d399',
                        cursor: isSelf ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                        opacity: isSelf ? 0.4 : 1,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
