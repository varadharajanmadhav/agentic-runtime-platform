import { useState } from 'react';
import { useAppStore } from '../store/index.js';
import { Mail, Lock, User, LogIn, UserPlus, Shield } from 'lucide-react';

export function Login() {
  const { login, register } = useAppStore();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) throw new Error('Name is required');
        const res = await register(email, name, password);
        if (!res.success) {
          setError(res.error || 'Registration failed');
        }
      } else {
        const res = await login(email, password);
        if (!res.success) {
          setError(res.error || 'Invalid credentials');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100vw',
      height: '100vh',
      background: 'radial-gradient(circle at center, #1e1e2e 0%, #0d0d16 100%)',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      color: '#cdd6f4',
    }}>
      {/* Background decoration glows */}
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(137, 180, 250, 0.15) 0%, rgba(137, 180, 250, 0) 70%)',
        top: '20%',
        left: '30%',
        zIndex: 0,
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute',
        width: '400px',
        height: '400px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(203, 166, 247, 0.1) 0%, rgba(203, 166, 247, 0) 70%)',
        bottom: '20%',
        right: '30%',
        zIndex: 0,
        pointerEvents: 'none',
      }} />

      {/* Glassmorphic Container */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        width: '420px',
        padding: '40px',
        borderRadius: '16px',
        background: 'rgba(24, 24, 37, 0.7)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        transition: 'all 0.3s ease-in-out',
      }}>
        {/* Header Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '8px' }}>
          <Shield size={28} style={{ color: '#89b4fa' }} />
          <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '0.5px', color: '#f5c2e7' }}>
            ARP Workspace
          </span>
        </div>
        <p style={{
          textAlign: 'center',
          fontSize: '13px',
          color: '#a6adc8',
          margin: '0 0 28px 0',
        }}>
          {isRegister ? 'Create your agentic engineering account' : 'Sign in to access your autonomous agents'}
        </p>

        {error && (
          <div style={{
            background: 'rgba(243, 139, 168, 0.1)',
            border: '1px solid rgba(243, 139, 168, 0.2)',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '12px',
            color: '#f38ba8',
            marginBottom: '20px',
            lineHeight: 1.4,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isRegister && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#6c7086' }}><User size={16} /></span>
                <input
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 12px 12px 38px',
                    borderRadius: '8px',
                    background: '#11111b',
                    border: '1px solid #313244',
                    color: '#cdd6f4',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  required
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#6c7086' }}><Mail size={16} /></span>
              <input
                type="email"
                placeholder="dev@agentic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 38px',
                  borderRadius: '8px',
                  background: '#11111b',
                  border: '1px solid #313244',
                  color: '#cdd6f4',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#a6adc8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#6c7086' }}><Lock size={16} /></span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 38px',
                  borderRadius: '8px',
                  background: '#11111b',
                  border: '1px solid #313244',
                  color: '#cdd6f4',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '10px',
              padding: '12px',
              borderRadius: '8px',
              background: '#89b4fa',
              color: '#11111b',
              fontWeight: 700,
              fontSize: '14px',
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background 0.2s',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <span>Processing...</span>
            ) : isRegister ? (
              <>
                <UserPlus size={16} />
                <span>Create Account</span>
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          fontSize: '13px',
          color: '#a6adc8',
        }}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#89b4fa',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
              fontSize: '13px',
              textDecoration: 'underline',
            }}
          >
            {isRegister ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
