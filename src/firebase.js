// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyArdR6bYgwYS2H_KI4acev2rSG-M3N_pnE",
  authDomain: "classbrainstorm-9ce5b.firebaseapp.com",
  projectId: "classbrainstorm-9ce5b",
  storageBucket: "classbrainstorm-9ce5b.firebasestorage.app",
  messagingSenderId: "1047403578924",
  appId: "1:1047403578924:web:a0e30e4a722e3ca26b7389",
  measurementId: "G-04300E3V4V"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;