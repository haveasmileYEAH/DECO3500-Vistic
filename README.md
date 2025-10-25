# VISTIC - TRUTHQUEST: Community Based Fake News Verification.

---
## 📘 Introduction 
Welcome to the source code for Team VISTIC, developed for Social and Mobile Computing (DECO3500).

We proudly present our project: TRUTHQUEST - A community based fake news verification street challenge program, a web-based system designed to provide a simulated environment for the creation of fake news and its resulting impacts to the university students.

Through research on existing social networks, we have observed that numerous open social platforms, including X (formerly Twitter) and Facebook, employ a method called “crowdsourced voting” to reduce the speed and reach of fake news. First introduced on the X (Twitter) platform, crowdsourced voting enables users from diverse industries, locations, genders, and identity backgrounds to evaluate the same piece of information. Based on the voting results, it helps other users identify whether the content constitutes fake news.

We aim to simulate an experience where Player1 users act as fake news creators, experiencing the process of fabricating false information; Player2 users become victims of fake news, learning how to discern the truthfulness of unsourced messages through reading. Additionally, spectators can join the game by scanning a QR code with their phones, voting on questions selected by Player2 and choosing whether to comment. Each news item is only viewable for 30 seconds. Player2 must determine the authenticity of the text based on its content and the audience's voting results.

For specific design concepts, sources of inspiration, and other design details, please refer to GitWiki.

---
## 🛠️ Project Tech Stack
**Frontend**: HTML5, CSS3, JavaScript
**Backend**: server.js, Node.js
**Database**: Supabase (Postgres + RLS + Realtime)
**Development Tools**: GitHub, WhatsApp, Discord, Visual Studio Code

---
# ⚙️ Prerequisites – TRUTHQUEST Setup

Before setting up the project, ensure you have the following installed:

- **Node.js** 22.20.0 or higher
- **npm** 10.9.3 or higher
- **Git** 

---

## 🛠️ Node.js Installation

You only need to choose one method to set up your environment; we recommend trying “1. Quick Install” first. If you encounter difficulties installing Node, you can directly use “2. The Docker method provided on the official website”.

1. If your operation system is Windows11 or MacOS, you can try the following command to run the project,    however the command are the shortcut, but if it works, you will not need to install the docker and set it up.

Windows11: winget install --id OpenJS.NodeJS.LTS (bash)

MacOS: brew install node (zsh)

2. If the Shortcut is not working, you can use the official website to finish the Node.js installation and setup, refer to the official documentation for your operating system:

- https://nodejs.org/en/download

The page provide comprehensive instructions for installation, configuration, and best practices tailored to each platform.

3. After you download, please use the following commands to verify the installation was successful.

node -v 
npm -v 

if install successfully, the above commands will print:
"v22.20.0" or higher
"v10.9.3" or higher

---

# 🔧 Installation & Setup
After you successfully finish the Node.js Installation steps, use the command to install the dependents:

npm install

After you successfully finish install the dependents, you will see:

"Run `npm audit` for details."

### 1. Connect with the Supabase.
The .env file contains all keys for direct connection to Supabase and should be placed directly in the root directory.

The .env file is included in the commit results. Please download the file and place it in the root directory.

### 2. Run project code
After the installation and setup are successfully finished, use the following command to run the code:

npm start

If the code is run successfully, you can see the following output:

"> socketio-kahoot@1.0.0 start"
"> socketio-kahoot@1.0.0 start"
"> node server.js"
"[dotenv@17.2.3] injecting env (3) from .env -- tip: 🔐 prevent committing .env to code: https://dotenvx.com/precommit"
"listening on *:3000"
"Permanent practice room code: LEARN01"

### 3. Use the localhost to run the game
To verify the code's reproducibility, you can run the code on your current device, including links and interactions between the four pages: Player1, Player2, audience, and display. Open the following link to run the code:

Player1: http://localhost:3000/player1

Player2: http://localhost:3000/player2

Audience: http://localhost:3000/audience?code=XXXXXX

Display: http://localhost:3000/display?code=XXXXXX

### 4. Use the IPv4 address to run the game
Our system also supports connecting various devices via a local area network, including smartphones, computers, tablets, and more. The procedure is as follows:

1.  Enable cellular data and personal hotspot on your phone, then connect all desired devices to your personal hotspot (no additional steps are needed for the phone acting as the hotspot).

2.  Locate your IPv4 network address using the following commands:

    Windows: ipconfig
    MacOS: ifconfig

3. Locate your IPv4 address in the output, typically formatted as:

    10.x.x.x
    172.16.x.x ~ 172.31.x.x
    192.168.x.x

4. Use your IPv4 address to access the webpage

Assuming your IPv4 address is: 172.20.10.5

After finding your IPv4 address, run the code using the command:

npm start

Once successfully running, use your IPv4 address as the host address in the link to connect:

Player1: http://172.20.10.5:3000/player1

Player2: http://172.20.10.5:3000/player2

Audience: http://172.20.10.5:3000/audience?code=XXXXXX

Display: http://172.20.10.5:3000/display?code=XXXXXX

### 4. Run the Game by Localhost or IPv4
1. Use the Player1 to generate and apply the room code.
2. Copy the room code and apply for the Player2, Audience and Display page.
3. Select a category and click "Quiz in Progress"
4. (If you run the game by IPv4) Join the same Audience page with same room code by scanning the QR code in Display page after you apply the room code that you applied in Player1.

# Directory Tree
DECO3500-Vistic/
├─ node_modules/               # Socket dependencies
├─ public/
│  ├─ css/                     # css files
│  ├─ data/                    # question data
│  └─ js/                      # JavaScript files
├─ .gitignore                  # Git ignore rules
├─ .env.example                # sample env (do NOT commit .env)
├─ audience.html               # audience page
├─ display.html                # display page
├─ package.json
├─ package-lock.json
├─ player1.html
├─ player2.html
├─ README.md
├─ schema.sql                  # create DB, RLS, RPC
└─ server.js                   # backend main service

## 📄 License

This is a university capstone project. Not intended for commercial use.