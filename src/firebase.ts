import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCicwyi9HqSg2dbNnx0D59Mao7XxsOppKs",
  authDomain: "vibes-7fc70.firebaseapp.com",
  projectId: "vibes-7fc70",
  storageBucket: "vibes-7fc70.firebasestorage.app",
  messagingSenderId: "889643380619",
  appId: "1:889643380619:web:bf915a00a79f47da4d898e"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
