# 🗄️ 02 – Database Connection & Configuration

## 1. Purpose
To connect the GreenShoes backend securely to a persistent cloud database (MongoDB Atlas) with environment-based configuration and proper access control.

---

## 2. Objectives
- Set up a **MongoDB Atlas cluster** using the Free M0 tier.  
- Configure **secure database credentials** and network access.  
- Link the database to the backend via the `.env` file.  
- Verify successful connection and log confirmation output.  
- Ensure `.env` isolation and `.gitignore` compliance.

---

## 3. Prerequisites
- MongoDB Atlas account  
- Active backend project folder (`greenshoes-be`)  
- Stable Internet connection  
- Environment file template (`.env.example`) already present  

---

## 4. Steps to Implement

### Step 1 – Create Cluster  
1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com).  
2. Select **Build a Database → Free Tier (M0)**.  
3. Region: nearest AWS region (e.g., US-East).  
4. Keep both default boxes checked:  
   - Automate security setup  
   - Preload sample dataset  
5. Click **Create Cluster**.

---

### Step 2 – Create Database User  
1. Open **Database Access → Add New User**.  
2. Username : `greenshoes-user`.  
3. Create a strong password.  
4. Role : `Atlas Admin`.  
5. Click **Add User** and copy the password for later use.  

---

### Step 3 – Configure Network Access  
1. Go to **Network Access → Add IP Address**.  
2. Select **Allow Access From Anywhere (0.0.0.0/0)**.  
3. Save changes.  
> This can be restricted to specific IP ranges in production.

---

### Step 4 – Connect Application  
1. Click **Connect → Drivers → Node.js (v6.7 or later)**.  
2. Copy the connection URI.  
3. Replace `<db_password>` with the actual password.  
4. Paste the updated string into `.env` under `MONGO_URI=`.

---

### Step 5 – Verify Connection  
1. Run `npm run dev` in the project root.  
2. Confirm terminal output shows:  
   - “Attempting DB Connect…”  
   - “MongoDB Connected Successfully”  
   - “Backend running on port 8080”  
3. Open `http://localhost:8080/health` and ensure JSON response `{ "ok": true }`.

---

## 5. Troubleshooting

| Issue | Likely Cause | Resolution |
|-------|--------------|-------------|
| MONGO_URI missing | `.env` not found or key not set | Copy `.env.example` → `.env` and update values |
| Authentication failed | Wrong username/password | Reset credentials in Atlas |
| Timeout errors | IP not whitelisted | Add `0.0.0.0/0` or correct IP |
| URI invalid | Missing query parameters | Re-copy full string from Atlas |
| Port 8080 in use | Another service active | Change `PORT` in `.env` |

---

## 6. Security Checklist
- `.env` excluded from GitHub via `.gitignore`.  
- Database user limited to necessary roles after initial setup.  
- IP access restricted in production.  
- Credentials rotated quarterly.  

---

## 7. Outcome
* MongoDB Atlas successfully connected to the backend.  
* Verified live connection and server startup.  
* Secure configuration established for future modules.

---

**Author:** Kamalasankari Subramaniakuppusamy  
**Date:** October 30 2025  
**Version:** v1.0  
**Module:** Database Connection & Configuration
