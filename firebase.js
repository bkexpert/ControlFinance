import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB5iHGYKNveScUcQnw2PPemZd59-CrwqYc",
  authDomain: "planejamento-financeiro-d8c21.firebaseapp.com",
  projectId: "planejamento-financeiro-d8c21",
  storageBucket: "planejamento-financeiro-d8c21.firebasestorage.app",
  messagingSenderId: "417634398972",
  appId: "1:417634398972:web:c8d323c783e49dc49c1d79"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

const db = getFirestore(app);

console.log("Firebase conectado com sucesso!");

export {
  auth,
  db,

  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  onAuthStateChanged,

  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot
};
