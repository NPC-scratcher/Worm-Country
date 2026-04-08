import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const config1 = {
  apiKey: "AIzaSyCicwyi9HqSg2dbNnx0D59Mao7XxsOppKs",
  authDomain: "vibes-7fc70.firebaseapp.com",
  projectId: "vibes-7fc70",
  storageBucket: "vibes-7fc70.firebasestorage.app",
  messagingSenderId: "889643380619",
  appId: "1:889643380619:web:bf915a00a79f47da4d898e"
};

const config2 = {
  apiKey: "AIzaSyDI-t5Jg1arXnfum8se18DHshi-oKq9-ds",
  authDomain: "vibes-f70be.firebaseapp.com",
  projectId: "vibes-f70be",
  storageBucket: "vibes-f70be.firebasestorage.app",
  messagingSenderId: "329980239954",
  appId: "1:329980239954:web:760416263710270a067f8b"
};

const config3 = {
  apiKey: "AIzaSyAYHwwCbqA4fJs-BsXdkEnMERhN4DqkTNY",
  authDomain: "studio-4030817408-ea18d.firebaseapp.com",
  projectId: "studio-4030817408-ea18d",
  storageBucket: "studio-4030817408-ea18d.firebasestorage.app",
  messagingSenderId: "451653569158",
  appId: "1:451653569158:web:c87abeb59c9ae107395f07"
};

export const servers = [
  { id: 'server1', name: 'US East (Alpha)', config: config1 },
  { id: 'server2', name: 'Europe (Beta)', config: config2 },
  { id: 'server3', name: 'Asia (Gamma)', config: config3 }
];

export const getDbForServer = (serverId: string) => {
  const server = servers.find(s => s.id === serverId) || servers[0];
  const apps = getApps();
  let app;
  if (!apps.find(a => a.name === server.id)) {
    app = initializeApp(server.config, server.id);
  } else {
    app = getApp(server.id);
  }
  return getFirestore(app);
};
