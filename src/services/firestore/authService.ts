import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  AuthError
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, DocumentReference } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { User, UserRole } from '../../types/auth';

// Helper function to determine role based on email
const determineRoleFromEmail = (email: string | null): UserRole => {
  if (!email) return 'operator';
  
  if (email.includes('admin')) return 'admin';
  if (email.includes('sales')) return 'sales_agent';
  if (email.includes('ops') || email.includes('manager')) return 'operations_manager';
  
  return 'operator';
};

// Safe Firebase helpers to handle null values
const safeGetDoc = async (docRef: DocumentReference | null) => {
  if (!docRef) throw new Error('Document reference is null');
  return getDoc(docRef);
};

const safeDoc = (path: string, ...segments: string[]): DocumentReference | null => {
  if (!db) return null;
  return doc(db, path, ...segments);
};

const safeSetDoc = async (docRef: DocumentReference | null, data: any, options?: any) => {
  if (!docRef) throw new Error('Document reference is null');
  return setDoc(docRef, data, options);
};

export const signUp = async (
  email: string,
  password: string,
  name: string,
  role: UserRole
): Promise<User> => {
  try {
    if (!auth) throw new Error('Firebase auth is not initialized');
    
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const { user: firebaseUser } = userCredential;

    await updateProfile(firebaseUser, { displayName: name });

    const userData = {
      id: firebaseUser.uid,
      name,
      email,
      role,
      createdAt: serverTimestamp(),
    };

    const userDocRef = safeDoc('users', firebaseUser.uid);
    await safeSetDoc(userDocRef, userData);

    return {
      id: firebaseUser.uid,
      name,
      email,
      role,
    };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
};

export const signIn = async (email: string, password: string): Promise<User> => {
  try {
    console.log('🔑 Starting sign in process for:', email);
    
    // Set flag for explicit auth action to prevent auto-reload issues
    // This tells our auth listener this is an intentional auth change
    sessionStorage.setItem('explicit-auth-action', 'true');
    
    // Sign in with Firebase Authentication
    if (!auth) throw new Error('Firebase auth is not initialized');
    
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const { user: firebaseUser } = userCredential;
    
    console.log('✅ Firebase authentication successful');
    
    // Force refresh token to ensure it's current
    await firebaseUser.getIdToken(true);
    
    // Get user data from Firestore
    try {
      console.log('🔍 Attempting to fetch user document from Firestore...');
      const userDocRef = safeDoc('users', firebaseUser.uid);
      const userDoc = await safeGetDoc(userDocRef);
      console.log('📄 User document exists?', userDoc.exists());
      
      let userData = userDoc.data();

      if (userData) {
        // Use data from Firestore if available
        console.log('✅ User data retrieved from Firestore:', userData);
        
        // Create user object with role info
        const user = {
          id: firebaseUser.uid,
          name: userData.name,
          email: userData.email,
          role: userData.role,
        };
        
        return user;
      } else {
        // If user document doesn't exist, create it now
        console.log('⚠️ User document does not exist in Firestore, creating it...');
        
        // Create basic user data
        userData = {
          id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          email: firebaseUser.email || '',
          role: determineRoleFromEmail(firebaseUser.email),
          createdAt: serverTimestamp(),
        };
        
        // Try to create user document
        try {
          await safeSetDoc(userDocRef, userData);
          console.log('✅ Created new user document in Firestore');
          
          // Return the newly created user
          return {
            id: firebaseUser.uid,
            name: userData.name,
            email: userData.email,
            role: userData.role,
          };
        } catch (createError) {
          console.error('❌ Failed to create user document:', createError);
          throw createError;
        }
      }
    } catch (firestoreError) {
      console.error('❌ Failed to get user data from Firestore:', firestoreError);
      console.log('Using fallback data from Firebase Auth');
    }
    
    // Fallback: Create user from Firebase Auth data if Firestore fails
    // Use our helper to determine role from email
    const role = determineRoleFromEmail(firebaseUser.email);
    
    // Create user object with data from Firebase Auth
    const user = {
      id: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
      email: firebaseUser.email || '',
      role: role,
    };
    
    // Try to create the user document in the background
    // This won't block login but will help for next time
    const bgUserDocRef = safeDoc('users', firebaseUser.uid);
    if (bgUserDocRef) {
      safeSetDoc(bgUserDocRef, {
        id: firebaseUser.uid,
        name: user.name,
        email: user.email,
        role: role,
        createdAt: serverTimestamp(),
      }).then(() => {
        console.log('✅ User document created in background after Firestore read failure');
      }).catch(err => {
        console.error('❌ Failed to create user document in background:', err);
      });
    } else {
      console.error('❌ Failed to create document reference for background save');
    }

    // Mark session as authenticated in sessionStorage
    sessionStorage.setItem('user-authenticated-this-session', 'true');
    
    // Import and use our persistent auth module
    // We need to use dynamic import to avoid circular dependencies
    const { savePersistentAuth } = await import('./persistentAuth');
    await savePersistentAuth(user);
    
    console.log('✅ Authentication complete with persistence');

    return user;
  } catch (error) {
    const authError = error as AuthError;
    console.error('Error signing in:', authError);
    
    // Provide more user-friendly error messages
    switch (authError.code) {
      case 'auth/invalid-credential':
        throw new Error('Invalid email or password. Please check your credentials and try again.');
      case 'auth/user-not-found':
        throw new Error('No account found with this email address.');
      case 'auth/wrong-password':
        throw new Error('Incorrect password. Please try again.');
      case 'auth/too-many-requests':
        throw new Error('Too many failed login attempts. Please try again later.');
      case 'auth/user-disabled':
        throw new Error('This account has been disabled. Please contact support.');
      default:
        throw new Error('An error occurred during sign in. Please try again.');
    }
  }
};

export const signOutUser = async (): Promise<void> => {
  try {
    console.log('🔒 Signing out user...');
    
    // Set flag for explicit auth action to prevent auto-reload issues
    // This tells our auth listener this is an intentional auth change
    sessionStorage.setItem('explicit-auth-action', 'true');
    
    // Clear our persistent auth
    const { clearPersistentAuth } = await import('./persistentAuth');
    clearPersistentAuth();
    
    // Clear session authentication marker
    sessionStorage.removeItem('user-authenticated-this-session');
    
    // Sign out from Firebase 
    if (!auth) {
      console.warn('⚠️ Cannot sign out: Firebase auth is not initialized');
      return;
    }
    
    await signOut(auth);
    
    console.log('✅ User signed out successfully');
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const getCurrentUser = async (): Promise<User | null> => {
  if (!auth) {
    console.warn('⚠️ Cannot get current user: Firebase auth is not initialized');
    return null;
  }
  
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return null;

  try {
    // Try to get user data from Firestore
    console.log('🔍 getCurrentUser: Fetching user document from Firestore...');
    const userDocRef = safeDoc('users', firebaseUser.uid);
    
    if (!userDocRef) {
      console.warn('⚠️ Cannot get user document: Firestore not initialized');
      
      // Return fallback user from auth data
      const role = determineRoleFromEmail(firebaseUser.email);
      return {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
        email: firebaseUser.email || '',
        role: role,
      };
    }
    
    const userDoc = await safeGetDoc(userDocRef);
    const userData = userDoc.data();

    if (userData) {
      console.log('✅ getCurrentUser: Found user data in Firestore');
      return {
        id: firebaseUser.uid,
        name: userData.name,
        email: userData.email,
        role: userData.role,
      };
    }
    
    // If no user document, create a fallback user
    console.log('⚠️ getCurrentUser: No user document found, creating fallback');
    const role = determineRoleFromEmail(firebaseUser.email);
    
    // Return fallback user
    return {
      id: firebaseUser.uid,
      name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
      email: firebaseUser.email || '',
      role: role,
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    throw error;
  }
};

// Export for potential future use
export const updateUserProfile = async (
  userId: string,
  updates: Partial<User>
): Promise<User> => {
  try {
    const userRef = safeDoc('users', userId);
    
    if (!userRef) {
      throw new Error('Failed to create document reference: Firestore not initialized');
    }
    
    await safeSetDoc(userRef, updates, { merge: true });

    const updatedDoc = await safeGetDoc(userRef);
    const userData = updatedDoc.data();

    if (!userData) {
      throw new Error('User data not found after update');
    }

    return {
      id: userId,
      name: userData.name,
      email: userData.email,
      role: userData.role,
    };
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
};