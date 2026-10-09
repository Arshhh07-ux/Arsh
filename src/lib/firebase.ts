
import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAl4qoYjJftGuxDQJc4hYucwEIdkShAv4s",
  authDomain: "socialx-5.firebaseapp.com",
  databaseURL: "https://socialx-5-default-rtdb.firebaseio.com",
  projectId: "socialx-5",
  storageBucket: "socialx-5.firebasestorage.app",
  messagingSenderId: "233586940457",
  appId: "1:233586940457:web:bb4ba7c8d08dda34961a38",
  measurementId: "G-QTHEE2RBML",
};

const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const realtimeDb = getDatabase(app);
