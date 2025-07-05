import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { setupInitialUsers } from '../services/firestore/setupUsers';

// Configure with directly exported config for better reliability
export const firebaseConfig = {
  apiKey: "AIzaSyABVXrylOIescVfarC8WhtDcDvJa8bxDKU",
  authDomain: "ai-crm-database.firebaseapp.com",
  projectId: "ai-crm-database",
  storageBucket: "ai-crm-database.firebasestorage.app",
  messagingSenderId: "201042126488",
  appId: "1:201042126488:web:9c85da043d8db0686452ed",
  // Explicitly enable persistence
  persistence: true
};

// Initialize Firebase only if it hasn't been initialized yet
console.log('🔥 Initializing Firebase with config:', {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain
});

let app;
try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
  console.log('✅ Firebase app initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Firebase app:', error);
  app = null;
}

// Initialize Firestore
let firestoreDb;
try {
  firestoreDb = app ? getFirestore(app) : null;
  console.log('✅ Firestore initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Firestore:', error);
  firestoreDb = null;
}
export const db = firestoreDb;

// Initialize Auth
let firebaseAuth;
try {
  firebaseAuth = app ? getAuth(app) : null;
  console.log('✅ Firebase Auth initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Firebase Auth:', error);
  firebaseAuth = null;
}
export const auth = firebaseAuth;

// DISABLED Firebase persistence - require explicit login
// Clear any existing authentication state to prevent auto-login
try {
  // Force sign out any existing user to prevent auto-logins
  if (!window.location.pathname.includes('/login')) {
    console.log('🔒 DISABLING Firebase auth persistence - auth state will NOT persist across page reloads');
    
    // Clear persistent auth flags
    localStorage.removeItem('firebase-persistence-enabled');
    localStorage.removeItem('firebase-persistence-set-time');
    
    // Force clear auth state if not on login page and no explicit login
    const hasExplicitLogin = localStorage.getItem('explicit-login-performed') === 'true';
    if (!hasExplicitLogin) {
      console.log('� No explicit login detected - clearing any Firebase auth state');
      
      // Sign out current user
      if (auth) {
        auth.signOut().then(() => {
          console.log('✅ Cleared Firebase auth state');
          
          // Redirect to login page
          if (window.location.pathname !== '/login') {
            console.log('🔄 Redirecting to login page');
            window.location.href = '/login';
          }
        });
      } else {
        console.warn('⚠️ Auth is null, cannot sign out');
        // Force redirect to login page
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    } else {
      console.log('� Explicit login detected - allowing session to continue');
    }
  } else {
    console.log('🔒 On login page - no action needed');
  }
} catch (error) {
  console.error('❌ Error in Firebase auth state cleanup:', error);
}

// Enable offline persistence if db is initialized
if (db) {
  enableIndexedDbPersistence(db)
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.error('Multiple tabs open, persistence can only be enabled in one tab at a time.');
      } else if (err.code === 'unimplemented') {
        console.error('The current browser does not support persistence.');
      } else {
        console.error('Error enabling persistence:', err);
      }
    });
} else {
  console.warn('⚠️ Cannot enable IndexedDB persistence: Firestore not initialized');
}

// Only set up initial users if explicitly requested with a flag
// This prevents hitting Firebase rate limits with too many account creation attempts
const shouldSetupUsers = localStorage.getItem('setup-initial-users') === 'true';
if (shouldSetupUsers) {
  console.log('Setting up initial users as requested...');
  setupInitialUsers()
    .then(() => {
      // Clear the flag after successful setup
      localStorage.removeItem('setup-initial-users');
    })
    .catch((error) => {
      console.error('Failed to set up initial users:', error);
      // If we hit rate limits, prevent additional attempts for 1 hour
      if (error?.code === 'auth/too-many-requests') {
        localStorage.setItem('user-setup-cooldown', (Date.now() + 3600000).toString());
      }
    });
} else {
  // Check if we're in a cooldown period from rate limiting
  const cooldownUntil = parseInt(localStorage.getItem('user-setup-cooldown') || '0', 10);
  if (cooldownUntil > Date.now()) {
    console.log(`User setup on cooldown until ${new Date(cooldownUntil).toLocaleTimeString()}`);
  }
}