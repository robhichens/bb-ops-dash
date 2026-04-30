// ============================================================
// firebase.js — Firebase config & Firestore initialization
// ============================================================
// Replace the placeholder values below with your project's
// config object from:
// Firebase Console → Project Settings → Your apps → SDK setup
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCcDAaeC4FrOg6PbBZkfjFWR8NIZvt1Srg",
  authDomain: "bb-ops-dashboard.firebaseapp.com",
  projectId: "bb-ops-dashboard",
  storageBucket: "bb-ops-dashboard.firebasestorage.app",
  messagingSenderId: "339463059702",
  appId: "1:339463059702:web:4531dd8148287aaa3ad4d7"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
