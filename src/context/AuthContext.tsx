import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import client from '../api/client';
import { LoginCredentials, LoginResponse, loginRestaurant, refreshAuthToken, verifyRestaurantOtp } from '../api/authApi';

import { AuthRole } from '../types';
import { loginOwner, verifyOwnerOtp, switchOutlet as switchOutletApi } from '../api/ownerApi';

function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function extractRestaurantIdsFromToken(token: string): string[] | undefined {
  const claims = parseJwt(token);
  if (!claims) return undefined;
  const rawIds = claims.restaurant_ids || claims.restaurantIds || claims.restaurant_id;
  if (typeof rawIds === 'string' && rawIds.trim()) {
    return rawIds.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (Array.isArray(rawIds)) {
    return rawIds.map(String).filter(Boolean);
  }
  return undefined;
}

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  originalRole?: AuthRole;
  outletId?: string;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  restaurantIds?: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (credentials: LoginCredentials, role: AuthRole, remember?: boolean) => Promise<void>;
  loginWithOtp: (phone: string, otp: string, role: AuthRole, remember?: boolean) => Promise<void>;
  switchOutlet: (outletId: string) => Promise<void>;
  resetToOwner: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const ACCESS_TOKEN_KEY = 'hivago_access_token';
const REFRESH_TOKEN_KEY = 'hivago_refresh_token';
const USER_KEY = 'hivago_user';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage first, then sessionStorage
    const storage = localStorage.getItem(ACCESS_TOKEN_KEY) ? localStorage : sessionStorage;
    
    const savedAccessToken = storage.getItem(ACCESS_TOKEN_KEY);
    const savedRefreshToken = storage.getItem(REFRESH_TOKEN_KEY);
    const savedExpiresAt = storage.getItem(`${ACCESS_TOKEN_KEY}_expires_at`);
    const savedUser = storage.getItem(USER_KEY);

    const isExpired = savedExpiresAt && new Date(savedExpiresAt).getTime() <= Date.now();
    const isSessionRemembered = localStorage.getItem(ACCESS_TOKEN_KEY) !== null;

    if (savedAccessToken && !isExpired) {
      console.log(`[Auth] Restoring session from ${storage === localStorage ? 'localStorage' : 'sessionStorage'}...`);
      setAccessToken(savedAccessToken);
      setRefreshToken(savedRefreshToken);
      setAccessTokenExpiresAt(savedExpiresAt);
      client.defaults.headers.common.Authorization = `Bearer ${savedAccessToken}`;
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          const tokenRestaurantIds = extractRestaurantIdsFromToken(savedAccessToken);
          setUser({
            ...parsedUser,
            restaurantIds: tokenRestaurantIds || parsedUser.restaurantIds
          });
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
    } else if (savedAccessToken && isExpired && savedRefreshToken) {
      // Access token is expired, but we have a refresh token! Attempt a silent refresh immediately on mount.
      console.log('[Auth] Access token is expired, attempting silent refresh on mount...');
      setRefreshToken(savedRefreshToken);
      if (savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          const tokenRestaurantIds = extractRestaurantIdsFromToken(savedAccessToken);
          setUser({
            ...parsedUser,
            restaurantIds: tokenRestaurantIds || parsedUser.restaurantIds
          });
        } catch {
          // ignore
        }
      }

      const tryRefresh = async () => {
        setIsRefreshing(true);
        try {
          const response = await refreshAuthToken(savedRefreshToken);
          setAccessToken(response.accessToken);
          setRefreshToken(response.refreshToken);
          setAccessTokenExpiresAt(response.accessTokenExpiresAt);
          
          const targetStorage = isSessionRemembered ? localStorage : sessionStorage;
          targetStorage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
          targetStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
          targetStorage.setItem(`${ACCESS_TOKEN_KEY}_expires_at`, response.accessTokenExpiresAt);

          const refreshedIds = extractRestaurantIdsFromToken(response.accessToken);
          if (savedUser) {
            try {
              const parsedUser = JSON.parse(savedUser);
              const updatedUser = { ...parsedUser, restaurantIds: refreshedIds || parsedUser.restaurantIds };
              setUser(updatedUser);
              targetStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
            } catch {
              // ignore
            }
          }
          
          client.defaults.headers.common.Authorization = `Bearer ${response.accessToken}`;
          console.log('[Auth] Silent refresh on mount succeeded, session restored.');
        } catch (err) {
          console.error('[Auth] Silent refresh on mount failed, clearing session...', err);
          logout();
        } finally {
          setIsRefreshing(false);
          setLoading(false);
        }
      };
      
      tryRefresh();
    } else {
      if (savedAccessToken) {
        console.log('[Auth] Saved session expired without a valid refresh path, clearing...');
        logout();
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
      sessionStorage.setItem('hivago_session_expired', 'true');
    };

    window.addEventListener('hivago-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('hivago-unauthorized', handleUnauthorized);
  }, []);

  // Expiration Tracker
  useEffect(() => {
    if (!accessTokenExpiresAt) {
      setShowSessionWarning(false);
      return;
    }

    const WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes in milliseconds

    const checkExpiration = () => {
      const expiresAt = new Date(accessTokenExpiresAt).getTime();
      const now = Date.now();
      const timeRemaining = expiresAt - now;

      if (timeRemaining <= 0) {
        // Token has expired
        if (refreshToken) {
          // Silently refresh in the background if a refresh token is present
          if (!isRefreshing) {
            console.log('[Auth] Access token expired, performing silent background refresh...');
            refreshSession();
          }
        } else {
          logout();
          setShowSessionWarning(false);
          sessionStorage.setItem('hivago_session_expired', 'true');
        }
      } else if (timeRemaining <= WARNING_THRESHOLD) {
        // Soon to expire
        if (refreshToken) {
          // Silently refresh automatically in the background without showing any warning popup
          if (!isRefreshing) {
            console.log('[Auth] Access token near expiration, performing automatic refresh...');
            refreshSession();
          }
        } else {
          setShowSessionWarning(true);
        }
      } else {
        setShowSessionWarning(false);
      }
    };

    checkExpiration();
    const interval = setInterval(checkExpiration, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [accessTokenExpiresAt, refreshToken, isRefreshing]);

  const login = async (credentials: LoginCredentials, role: AuthRole, remember: boolean = false) => {
    console.log(`[Auth] Attempting ${role} login for ${credentials.email} (Remember: ${remember})...`);
    
    let response: LoginResponse;
    if (role === 'owner') {
      response = await loginOwner(credentials);
    } else {
      response = await loginRestaurant(credentials);
    }

    console.log('[Auth] Login successful, saving tokens and user info...');
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);
    setAccessTokenExpiresAt(response.accessTokenExpiresAt);
    
    client.defaults.headers.common.Authorization = `Bearer ${response.accessToken}`;

    let profileData: any = null;
    if (role === 'owner') {
      const { getOwnerProfile } = await import('../api/ownerApi');
      try {
        profileData = await getOwnerProfile();
      } catch (err) {
        console.error('[Auth] Failed to fetch owner profile', err);
      }
    }

    const restaurantIds = extractRestaurantIdsFromToken(response.accessToken);
    const newUser: AuthUser = {
      id: role === 'owner' ? (profileData?.id || (response as any).ownerId) : (response as any).restaurantId,
      name: role === 'owner' ? (profileData?.name || response.name || 'Owner') : response.name,
      email: role === 'owner' ? (profileData?.email || credentials.email) : credentials.email,
      role,
      originalRole: role,
      ownerId: role === 'owner' ? (profileData?.id || (response as any).ownerId) : undefined,
      ownerName: role === 'owner' ? (profileData?.name || response.name || 'Owner') : undefined,
      ownerEmail: role === 'owner' ? (profileData?.email || credentials.email) : undefined,
      restaurantIds
    };
    setUser(newUser);

    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    storage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    storage.setItem(`${ACCESS_TOKEN_KEY}_expires_at`, response.accessTokenExpiresAt);
    storage.setItem(USER_KEY, JSON.stringify(newUser));

    if (role === 'owner') {
      storage.setItem('hivago_owner_access_token', response.accessToken);
    }

  };

  const loginWithOtp = async (phone: string, otp: string, role: AuthRole, remember: boolean = false) => {
    console.log(`[Auth] Attempting ${role} OTP login for ${phone} (Remember: ${remember})...`);
    
    let response: LoginResponse;
    if (role === 'owner') {
      response = await verifyOwnerOtp(phone, otp);
    } else {
      response = await verifyRestaurantOtp(phone, otp);
    }

    console.log('[Auth] OTP Login successful, saving tokens and user info...');
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);
    setAccessTokenExpiresAt(response.accessTokenExpiresAt);
    
    client.defaults.headers.common.Authorization = `Bearer ${response.accessToken}`;

    let profileData: any = null;
    if (role === 'owner') {
      const { getOwnerProfile } = await import('../api/ownerApi');
      try {
        profileData = await getOwnerProfile();
      } catch (err) {
        console.error('[Auth] Failed to fetch owner profile', err);
      }
    }

    const restaurantIdsFromOtp = extractRestaurantIdsFromToken(response.accessToken);
    const newUser: AuthUser = {
      id: role === 'owner' ? (profileData?.id || (response as any).ownerId) : (response as any).restaurantId,
      name: role === 'owner' ? (profileData?.name || response.name || 'Owner') : response.name,
      email: role === 'owner' ? (profileData?.email || phone) : phone,
      role,
      originalRole: role,
      ownerId: role === 'owner' ? (profileData?.id || (response as any).ownerId) : undefined,
      ownerName: role === 'owner' ? (profileData?.name || response.name || 'Owner') : undefined,
      ownerEmail: role === 'owner' ? (profileData?.email || phone) : undefined,
      restaurantIds: restaurantIdsFromOtp
    };
    setUser(newUser);

    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    storage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    storage.setItem(`${ACCESS_TOKEN_KEY}_expires_at`, response.accessTokenExpiresAt);
    storage.setItem(USER_KEY, JSON.stringify(newUser));

    if (role === 'owner') {
      storage.setItem('hivago_owner_access_token', response.accessToken);
    }
  };

  const switchOutlet = async (outletId: string) => {
    console.log(`[Auth] Switching to outlet ${outletId}...`);
    const response = await switchOutletApi(outletId);
    
    console.log('[Auth] Switch successful, updating tokens...');
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);
    setAccessTokenExpiresAt(response.accessTokenExpiresAt);
    
    // Update user role and ID to restaurant for the dashboard
    if (user) {
      const switchedRestaurantIds = extractRestaurantIdsFromToken(response.accessToken);
      const updatedUser: AuthUser = {
        ...user,
        id: response.restaurantId,
        name: response.name || user.name,
        role: 'restaurant',
        originalRole: user.originalRole || user.role,
        outletId: response.restaurantId,
        restaurantIds: switchedRestaurantIds || user.restaurantIds
      };
      setUser(updatedUser);
      const storage = localStorage.getItem(ACCESS_TOKEN_KEY) ? localStorage : sessionStorage;
      storage.setItem(USER_KEY, JSON.stringify(updatedUser));
    }

    const storage = localStorage.getItem(ACCESS_TOKEN_KEY) ? localStorage : sessionStorage;
    storage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
    storage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
    storage.setItem(`${ACCESS_TOKEN_KEY}_expires_at`, response.accessTokenExpiresAt);

    client.defaults.headers.common.Authorization = `Bearer ${response.accessToken}`;
  };

  const resetToOwner = async () => {
    console.log('[Auth] Resetting to owner context...');
    if (!user || user.originalRole !== 'owner') return;

    const ownerToken = localStorage.getItem('hivago_owner_access_token') || sessionStorage.getItem('hivago_owner_access_token');
    if (!ownerToken) return;

    setAccessToken(ownerToken);
    client.defaults.headers.common.Authorization = `Bearer ${ownerToken}`;

    const updatedUser: AuthUser = {
      ...user,
      id: user.ownerId || user.id,
      name: user.ownerName || user.name,
      email: user.ownerEmail || user.email,
      role: 'owner',
      outletId: undefined
    };
    setUser(updatedUser);

    const storage = localStorage.getItem(ACCESS_TOKEN_KEY) ? localStorage : sessionStorage;
    storage.setItem(ACCESS_TOKEN_KEY, ownerToken);
    storage.setItem(`${ACCESS_TOKEN_KEY}_expires_at`, '2099-01-01T00:00:00Z'); // Extend or re-fetch properly
    storage.setItem(USER_KEY, JSON.stringify(updatedUser));
  };

  const refreshSession = async () => {
    if (!refreshToken) return;
    setIsRefreshing(true);
    try {
      console.log('[Auth] Attempting to refresh token...');
      const response: LoginResponse = await refreshAuthToken(refreshToken);
      setAccessToken(response.accessToken);
      setRefreshToken(response.refreshToken);
      setAccessTokenExpiresAt(response.accessTokenExpiresAt);
      
      const isSessionRemembered = localStorage.getItem(ACCESS_TOKEN_KEY) !== null;
      const storage = isSessionRemembered ? localStorage : sessionStorage;
      storage.setItem(ACCESS_TOKEN_KEY, response.accessToken);
      storage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
      storage.setItem(`${ACCESS_TOKEN_KEY}_expires_at`, response.accessTokenExpiresAt);
      
      client.defaults.headers.common.Authorization = `Bearer ${response.accessToken}`;
      setShowSessionWarning(false);
    } catch (err) {
      console.error('[Auth] Failed to refresh token:', err);
      logout();
    } finally {
      setIsRefreshing(false);
    }
  };

  const logout = () => {
    console.log('[Auth] Logging out user and clearing session...');
    setAccessToken(null);
    setRefreshToken(null);
    setAccessTokenExpiresAt(null);
    setUser(null);
    
    // Clear both storages to be safe
    [localStorage, sessionStorage].forEach(storage => {
      storage.removeItem(ACCESS_TOKEN_KEY);
      storage.removeItem(REFRESH_TOKEN_KEY);
      storage.removeItem(`${ACCESS_TOKEN_KEY}_expires_at`);
      storage.removeItem(USER_KEY);
      storage.removeItem('hivago_owner_access_token');
    });

    delete client.defaults.headers.common.Authorization;
  };

  const value = useMemo(
    () => ({
      user,
      accessToken,
      refreshToken,
      accessTokenExpiresAt,
      isAuthenticated: Boolean(accessToken),
      loading,
      login,
      loginWithOtp,
      switchOutlet,
      resetToOwner,
      logout
    }),
    [user, accessToken, refreshToken, accessTokenExpiresAt, loading]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showSessionWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[24px] w-full max-w-[420px] shadow-2xl p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="mx-auto w-16 h-16 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 className="text-xl font-bold text-slate-900 mb-2">Session Expiring Soon</h2>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              For your security, your session will automatically end in a few moments. Would you like to stay logged in?
            </p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={refreshSession}
                disabled={isRefreshing}
                className="w-full bg-[#1D915F] hover:bg-[#15794d] text-white font-bold py-3.5 rounded-2xl transition-all shadow-md shadow-emerald-100/50 disabled:opacity-70 disabled:cursor-wait"
              >
                {isRefreshing ? 'Refreshing...' : 'Stay Logged In'}
              </button>
              <button 
                onClick={logout}
                disabled={isRefreshing}
                className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold py-3.5 rounded-2xl transition-all disabled:opacity-70"
              >
                Logout Now
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
