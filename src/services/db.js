// src/services/db.js
import { db } from "../firebase";
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, serverTimestamp
} from "firebase/firestore";

// 1. Real-time data sunne ke liye (Jab bhi data change ho, UI update ho jaye)
export const subscribeCollection = (name, cb, constraints = []) => {
  const q = constraints.length
    ? query(collection(db, name), ...constraints)
    : collection(db, name);
    
  return onSnapshot(q, snap => {
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(data);
  });
};

// 2. Naya data add karne ke liye (Jaise nayi Idea ya Student)
export const addItem = (name, data) =>
  addDoc(collection(db, name), { ...data, createdAt: serverTimestamp() });

// 3. Data update karne ke liye (Jaise Idea pe vote karna)
export const updateItem = (name, id, data) =>
  updateDoc(doc(db, name, id), data);

// 4. Data delete karne ke liye
export const deleteItem = (name, id) =>
  deleteDoc(doc(db, name, id));

// 5. Data save/overwrite karne ke liye (Jaise signup pe user save karna)
export const setItem = (name, id, data) =>
  setDoc(doc(db, name, id), data, { merge: true });