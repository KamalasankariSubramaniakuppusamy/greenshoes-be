# 🧾 Environment Setup (GreenShoes Backend)

---
## 1. Overview
This document details the complete backend environment setup for the **GreenShoes** e-commerce platform. It defines how to initialize the Node.js project, install dependencies, and configure environment variables to enable secure, reproducible local development.

---

## 2. Objective
To establish a secure and portable backend environment that supports:
- Express.js-based server
- MongoDB Atlas connectivity
- Configurable environment variables
- Local development with auto-reload (`nodemon`)
- Unit testing with Jest and Supertest

---

## 3. Prerequisites
Before setup, ensure the following tools are installed:
- **Node.js** v18 or later  
- **npm** v9 or later  
- **MongoDB Atlas** account  
- **VS Code** (recommended)  
- Stable internet connection  

---

## 4. Step-by-Step Implementation
---

### Step 1. Initialize the Project
```bash
mkdir greenshoes-be
cd greenshoes-be
npm init -y
```

Creates the project directory and initializes a default package.json.>

### Step 2. Install Dependencies
```bash
npm install express helmet cors cookie-parser morgan dotenv mongoose jsonwebtoken bcrypt qrcode speakeasy
npm install -D nodemon jest supertest mongodb-memory-server
```
### Runtime dependencies:
* ```express``` - Web framework
* ```helmet``` – Security middleware
* ```cors``` – Cross-origin support
* ```dotenv``` – Load environment variables
* ```mongoose``` – MongoDB ODM
* ```sonwebtoken``` – Token generation
* ```bcrypt``` – Password hashing
* ```qrcode & speakeasy``` – 2FA support

### Dev dependencies:

* ```nodemon``` – Auto-reload server
* ```jest & supertest``` – Unit testing
* ```mongodb-memory-server``` – Mock DB for test

### Step 3. Create Environment File

Inside project root, create **.env**:
```bash
touch .env
```
Paste the following:
```
PORT=8080
MONGO_URI=mongodb+srv://greenshoes-user:<your_db_password>@greenshoes-cluster.gvqkb6i.mongodb.net/greenshoes?retryWrites=true&w=majority
JWT_SECRET=<your-generated-secret>
COOKIE_NAME=gs_auth
CART_COOKIE=gs_cart
CLIENT_ORIGIN=http://localhost:5173
ADMIN_BASE=/ops-x94
NODE_ENV=development

```

### Step 4. Generate a Secure JWT Secret
```
openssl rand -base64 48 | pbcopy
```

This copies a cryptographically secure key to your clipboard; paste it into ```JWT_SECRET```.

### Step 5. Configure package.json Scripts

Update the ```scripts``` section:

```json
"scripts": {
  "dev": "nodemon src/server.js",
  "start": "node src/server.js",
  "test": "NODE_ENV=test NODE_OPTIONS=--experimental-vm-modules jest --runInBand"
}
```

### Step 6. Verify Environment

Start the development server:

```bash
npm run dev
```
Expected output:

```Backend running on port 8080```

---
### 5. Verification

---
Visit [http://localhost:8080/health](http://localhost:8080/health)

Expected JSON response:

```{ "ok": true }```

If displayed, the backend is running successfully and environment variables are correctly loaded.

---
### 6. Troubleshooting

---
| Issue                       | Cause                       | Fix                                           |
| --------------------------- | --------------------------- | --------------------------------------------- |
| `Cannot find module dotenv` | Dependency missing          | Run `npm install dotenv`                      |
| `MONGO_URI missing`         | `.env` not copied or loaded | Ensure `.env` exists in project root          |
| `Error: PORT in use`        | Another app using port 8080 | Change `PORT` in `.env` or stop other service |

### 7. Outcome

Successfully configured and verified backend environment for GreenShoes.

Server, environment variables, and dependencies are stable for future development.