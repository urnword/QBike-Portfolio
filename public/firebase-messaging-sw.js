importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyARm-FCTAM5kPVDG8qZZbf_zIOJWkwlOas",
  authDomain: "qbike-app.firebaseapp.com",
  projectId: "qbike-app",
  storageBucket: "qbike-app.firebasestorage.app",
  messagingSenderId: "386311968961",
  appId: "1:386311968961:web:e0b753a9545a13d8901c40"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // FCM automatically displays the notification using the 'notification' payload.
  // We only log here to keep the background listener active and prevent duplicates.
});
