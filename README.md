# 🕵️‍♂️ Deduction Matrix

> **Trust No One.** An interactive, real-time social deduction and secret chat game.

**Deduction Matrix** is a fast-paced browser game where players join a lobby, are secretly paired into anonymous breakout rooms, and have exactly 30 seconds to chat. Once the timer runs out, players must correctly deduce who they were just talking to in order to score points and climb the leaderboard.

Built for speed, real-time sync, and serverless deployment.

---

### ✨ Features

* **Real-Time Multiplayer:** Instant lobby sync, presence tracking, and live chat powered by Supabase Realtime.
* **Smart Matchmaking:** A mathematical Round-Robin pairing algorithm ensures players never talk to the same person twice until all combinations are exhausted. (Handles odd numbers of players seamlessly).
* **The 30-Second Panic:** Server-synced countdown timers that instantly rip players out of the chat and into the guessing phase.
* **Live Leaderboards:** Scores update instantly across all screens as soon as guesses are locked in.
* **Automated Janitor:** Abandoned rooms are automatically wiped from the database using PostgreSQL `pg_cron` extensions to prevent data bloat.

---

### 🛠️ Tech Stack

* **Framework:** Next.js (App Router)
* **Styling:** Tailwind CSS v4
* **Database & Auth:** Supabase (PostgreSQL, Row Level Security)
* **Real-time Engine:** Supabase Realtime (WebSockets)
* **Package Manager:** `pnpm`
* **UI & Animation:** Lucide-React (Icons), Canvas-Confetti

---

### 🚀 Local Development

To run this project locally, you will need [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed, along with a free [Supabase](https://supabase.com/) account.

**1. Clone the repository**

```bash
git clone https://github.com/debaditya99/DeductionMatrix.git
cd DeductionMatrix

```

**2. Install dependencies**

```bash
pnpm install

```

**3. Set up Supabase**

* Create a new project on Supabase.
* Run the SQL migrations (found in the repository or from the project setup) in your Supabase SQL Editor to create the `rooms`, `players`, and `messages` tables.
* Enable `pg_cron` in your Supabase Database Extensions.
* Enable Realtime broadcasts for all three tables in the SQL editor:
`alter publication supabase_realtime add table rooms, players, messages;`

**4. Configure Environment Variables**
Create a `.env.local` file in the root directory and add your Supabase project keys:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

```

**5. Start the development server**

```bash
pnpm dev

```

Open [http://localhost:3000](http://localhost:3000) in your browser to see the result.

---

### 🤝 How to Contribute

We welcome contributions to make Deduction Matrix even better! Whether it is a bug fix, UI polish, or a new game mode, your help is appreciated.

**Important:** All active development happens on the `test` branch.

To contribute:

1. Fork this repository to your own GitHub account.
2. Clone your fork locally.
3. **Create a new branch from the `test` branch** (do not branch from `main`):
```bash
git fetch origin
git checkout test
git checkout -b feature/your-amazing-feature

```


4. Make your changes and test them locally.
5. Commit your changes with clear, descriptive messages.
6. Push your branch to your fork:
```bash
git push origin feature/your-amazing-feature

```


7. Open a Pull Request targeting the **`test` branch** of this original repository.
