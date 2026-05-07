import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  deleteUser,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
  doc,
  collection,
  query,
  orderBy,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const firebaseConfig = {
  // Cole aqui o firebaseConfig do seu projeto Firebase.
  // Firebase Console > Configurações do projeto > Seus apps > SDK setup and configuration.
  apiKey: "COLE_SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
};

export const isFirebaseConfigured = !Object.values(firebaseConfig).some((value) =>
  String(value).includes("SEU_") || String(value).includes("COLE_")
);

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence).catch(() => {
  // A sessão ainda funciona na aba atual se a persistência local for bloqueada pelo navegador.
});

enableIndexedDbPersistence(db).catch(() => {
  // Cache offline pode falhar em múltiplas abas; o app continua online normalmente.
});

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  deleteUser,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  doc,
  collection,
  query,
  orderBy,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp
};

/*
REGRAS SEGURAS DO FIRESTORE
Cole em Firebase Console > Firestore Database > Rules.

rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function ownsUserDoc(userId) {
      return signedIn() && request.auth.uid == userId;
    }

    match /users/{userId} {
      allow read, create, update, delete: if ownsUserDoc(userId);

      match /categories/{categoryId} {
        allow read, create, update, delete: if ownsUserDoc(userId);
      }

      match /movements/{movementId} {
        allow read, create, update, delete: if ownsUserDoc(userId);
      }

      match /preferences/{preferenceId} {
        allow read, create, update, delete: if ownsUserDoc(userId);
      }
    }

    match /cpfIndex/{cpf} {
      allow read: if false;
      allow create: if signedIn()
        && !exists(/databases/$(database)/documents/cpfIndex/$(cpf))
        && request.resource.data.uid == request.auth.uid;
      allow update, delete: if signedIn() && resource.data.uid == request.auth.uid;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
*/
