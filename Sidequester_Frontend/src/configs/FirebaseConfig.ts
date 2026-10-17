// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAlIYo6OHHje38mW5a0cJIzhDyh2acWlzo",
  authDomain: "studentsidequest.firebaseapp.com",
  projectId: "studentsidequest",
  storageBucket: "studentsidequest.firebasestorage.app",
  messagingSenderId: "937241765381",
  appId: "1:937241765381:web:37f359d557d1f7e6795e6c",
  measurementId: "G-P7EHDLBL0D"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);