# BB Ops Dashboard

Rob Hichens · Director of Operations · Bright Beginnings Preschool  
Hosted on Netlify · Database on Firebase Firestore

---

## Project structure

```
bb-ops-dashboard/
├── index.html          # Entry point
├── css/
│   └── style.css       # All styles
├── js/
│   ├── firebase.js     # Firebase config & Firestore init
│   ├── app.js          # All app logic, Firestore CRUD
│   └── data.js         # Default seed tasks (first run only)
├── .gitignore
└── README.md
```

---

## Setup

### 1. Add your Firebase config

Open `js/firebase.js` and replace the placeholder values with your
project's config object. Find it at:

**Firebase Console → Project Settings → Your apps → SDK setup & configuration**

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "bb-ops-dashboard.firebaseapp.com",
  projectId: "bb-ops-dashboard",
  storageBucket: "bb-ops-dashboard.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 2. Set Firestore security rules

In Firebase Console → Firestore → Rules, paste:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tasks/{taskId} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ This allows open read/write — fine for personal solo use.
> If you ever share access, switch to auth-based rules.

### 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit — BB Ops Dashboard"
git branch -M main
git remote add origin https://github.com/robhichens/bb-ops-dashboard.git
git push -u origin main
```

### 4. Deploy on Netlify

1. Go to [netlify.com](https://netlify.com) → Add new site → Import from Git
2. Connect your GitHub repo
3. Build settings:
   - **Build command:** *(leave blank — no build step needed)*
   - **Publish directory:** `.` (root)
4. Click **Deploy site**

Netlify auto-deploys on every `git push` to `main`.

---

## How it works

- On first load, if Firestore is empty, the app seeds it with all default tasks automatically.
- All changes (status updates, notes, new tasks, deletes) write to Firestore in real time via `onSnapshot`.
- Category collapse state is saved to `localStorage` — it's UI preference, not data, so it stays local to your browser.
- The "Export JSON" button downloads a snapshot of all tasks as a `.json` file.

---

## Future ideas

- Add Firebase Auth (Google Sign-In) if you want Kathe/Molly to log in
- Add a "last updated" timestamp field per task
- Add due dates and a calendar view
- Connect to Netlify Functions for server-side logic (e.g. email reminders)
