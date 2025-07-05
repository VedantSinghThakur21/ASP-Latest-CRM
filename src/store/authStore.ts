/**
 * authStore.ts - Safe version
 * Removes all auto-login functionality
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthState } from '../types/auth';
import { signIn, signOutUser } from '../services/firestore/authService';
import { auth } from '../lib/firebase';
import { 
  saveAuthToStorage, 
  clearAuthFromStorage
} from '../utils/sessionStorage';

interface AuthStore extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: AuthState['user']) => void;
  clearUser: () => void;
}

// Track hydration to prevent loops
let hasHydrated = false;

// Create the store with proper typing
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      error: null,
      
      login: async (email: string, password: string) => {
        try {
          set({ error: null });
          
          // First sign in with Firebase
          const user = await signIn(email, password);
          
          // Ensure we have a current user and get their token
          if (!auth || !auth.currentUser) {
            throw new Error('Authentication failed: No current user');
          }
          
          // Get token with force refresh to ensure it's current
          const token = await auth.currentUser.getIdToken(true);
          
          // Update state after successful authentication
          set({ 
            user, 
            token, 
            isAuthenticated: true,
            error: null
          });
          
          // Also save to localStorage for backup persistence
          saveAuthToStorage(user, token);
          
          // CRITICAL: Mark that user has authenticated explicitly
          localStorage.setItem('explicit-login-performed', 'true');
          
          // Add a timestamp for the last successful login
          localStorage.setItem('last-login-time', Date.now().toString());
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        }
      },
      
      logout: async () => {
        try {
          // Mark that we're actively logging out
          localStorage.setItem('logging-out', 'true');
          
          // Clear persistent auth first
          const { clearPersistentAuth } = await import('../services/firestore/persistentAuth');
          clearPersistentAuth();
          
          // Sign out from Firebase
          await signOutUser();
          
          // Clear all auth-related state and storage
          set({ user: null, token: null, isAuthenticated: false, error: null });
          clearAuthFromStorage();
          
          // Remove the explicit login flag
          localStorage.removeItem('explicit-login-performed');
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          // Always clear the logging out flag, even on error
          setTimeout(() => {
            localStorage.removeItem('logging-out');
          }, 1000);
        }
      },
      
      // Simple helpers for setting/clearing user
      setUser: (user) => set({ 
        user, 
        isAuthenticated: !!user, 
        error: null 
      }),
      
      clearUser: () => set({ 
        user: null, 
        token: null, 
        isAuthenticated: false, 
        error: null 
      })
    }),
    {
      name: 'auth-storage',
      // Only store in localStorage if explicit login was performed
      skipHydration: true
    }
  )
);

/**
 * Hydrate the auth store - ONLY uses explicit login state
 * This version never auto-logs in
 */
export const hydrateAuthStore = () => {
  // Only rehydrate once to prevent infinite loops
  if (!hasHydrated) {
    try {
      console.log('💡 Starting auth store hydration');
      
      // For login page, don't force rehydration as we want fresh login
      if (window.location.pathname === '/login') {
        console.log('📌 On login page - minimal hydration only');
        hasHydrated = true;
        return;
      }
      
      // Check for explicit login flag
      const hasExplicitLogin = localStorage.getItem('explicit-login-performed') === 'true';
      
      // Only proceed if user has explicitly logged in
      if (!hasExplicitLogin) {
        console.log('📌 No explicit login detected - skipping auth hydration');
        hasHydrated = true;
        return;
      }
      
      console.log('📌 User has explicitly logged in - hydrating auth store');
      
      // Force immediate rehydration of the store for explicit logins only
      useAuthStore.persist.rehydrate();
      
      hasHydrated = true;
    } catch (error) {
      console.error('Error during auth store hydration:', error);
      hasHydrated = true; // Mark as hydrated even on error to prevent loops
    }
  }
};
