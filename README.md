# Volatility Engine - Global Trivia Exchange

An adaptive trivia game where players act as "investors" and wager on trivia questions with dynamic score multipliers based on the global difficulty of the question (the "volatility"). Designed to be played with a shared "Main Screen" Host display and individual phones as Controllers.

## System Architecture

This project is a monorepo consisting of three main parts:
1. **`packages/backend`**: The Node.js/Express socket server and Prisma Database orchestrator.
2. **`apps/host`**: A Next.js web application for the main TV/Desktop screen.
3. **`apps/controller`**: A Next.js web application for player phones.

## Local Network Hosting Instructions

You can host this game on your computer and let everyone in the room play using their phones, as long as all devices are connected to the same Wi-Fi network.

### Prerequisites
- Node.js installed on your computer.
- A Neon PostgreSQL database (with connection string in `packages/backend/.env`).
- OpenTDB questions seeded in the database.

### 1. Start the Servers
Open three separate terminal windows/tabs, navigate to the project root, and run the development servers:

**Terminal 1 (Backend WebSocket Server)**
```bash
cd packages/backend
npm run dev
```

**Terminal 2 (Host Screen)**
```bash
cd apps/host
npm run dev
```

**Terminal 3 (Mobile Controller)**
```bash
cd apps/controller
npm run dev
```

### 2. Find your Local IP Address
To let phones connect to your computer, you need your computer's local network IP address (usually starting with `192.168.x.x` or `10.0.x.x`). 
- **Windows**: Open Command Prompt and type `ipconfig`. Look for "IPv4 Address" under your Wi-Fi interface.
- **Mac**: Open Terminal and type `ipconfig getifaddr en0`.

### 3. Let's Play!
**On your Computer (The Main Screen):**
Open your favorite web browser and navigate to the Host app:
👉 `http://localhost:3002`

**On Player Phones (The Controllers):**
Tell everyone to open Chrome/Safari on their phones, ensure they are on the same Wi-Fi, and navigate to your computer's IP address on port 3000:
👉 `http://YOUR_LOCAL_IP:3000` (e.g., `http://192.168.68.57:3000`)

*The Host screen will display a 4-letter Room Code. Players enter this code and their name on their phones to join the trading floor!*

---

### Troubleshooting Connections
- **Phones Cannot Connect / Page won't load:** Your computer's firewall is likely blocking incoming connections to Node.js. 
  - *Windows*: Search for "Windows Defender Firewall", click "Allow an app or feature through Windows Defender Firewall", and ensure Node.js is checked for Private networks.
  - *Mac*: Go to System Settings -> Network -> Firewall -> Options, and ensure node is allowed to receive incoming connections.
- **Accidental Refreshes:** The game automatically saves session credentials. If a player or the host accidentally refreshes their browser window mid-game, they will instantly be reconnected to their exact state without losing points or the room!
