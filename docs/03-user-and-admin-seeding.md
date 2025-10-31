# 👥 03 – User and Admin Seeding

## 1. Purpose
To populate the MongoDB database with initial user and admin data for testing and validation purposes.  
This process helps verify database integration, model accuracy, and authentication readiness.

---

## 2. Objectives
- Seed sample user data into the `users` collection.  
- Seed an admin account with elevated privileges.  
- Validate that seeded data appears correctly in MongoDB Atlas.  
- Ensure role separation between standard users and administrators.  

---

## 3. Prerequisites
- Successful MongoDB Atlas connection (see 02-db-connection.md).  
- User model schema defined in the backend.  
- Project dependencies installed.  
- `.env` file correctly configured with `MONGO_URI`.  

---

## 4. Steps to Implement

### Step 1 – Create a Seeding Script Folder
1. In the project directory, create a folder named `src/seed`.  
2. This folder will store scripts used for both user and admin seeding.

---

### Step 2 – Seed Users
1. The user seeding script connects to MongoDB and inserts multiple sample user records.  
2. The sample set includes realistic international names and emails for diversity (e.g., `Aarav Mehta`, `Lucia Romano`, `Ethan Johnson`).  
3. Run the command:
```
npm run seed
```
4. Expected terminal output:
```
🌱 Connecting to MongoDB...
✅ Connected!
👤 Added user
🎉 Seeding completed successfully!
```

---

### Step 3 – Seed Admin Account
1. A separate script is used to add the initial admin user.  
2. The admin role is set as `admin`, distinct from the standard `user` role.  
3. Run the command:
```
npm run seed:admin
```
4. Expected terminal output:
```
👑 Connecting to MongoDB...
✅ Connected to DB!
```


---

### Step 4 – Verify in MongoDB Atlas
1. Open your cluster on MongoDB Atlas.  
2. Go to **Collections → greenshoes → users**.  
3. Verify that:
- 5 sample users are listed.  
- 1 admin record exists with the correct role.  
4. Confirm that each record contains:
- `username`, `email`, `role`, `is2FAEnabled`, and timestamps.  

---

## 5. Security and Access Notes
- Admin users are stored in the same collection but differentiated by role.  
- Access routes for admins and users are kept distinct (`/api/auth` vs `/ops-x94/auth`).  
- No plain passwords are stored—each is securely hashed using `bcrypt`.  
- The seeding scripts can be removed or disabled in production builds.  

---

## 6. Troubleshooting

| Issue | Likely Cause | Resolution |
|-------|--------------|------------|
| “Cannot find module seedUsers.js” | File missing or path incorrect | Ensure `src/seed/seedUsers.js` exists |
| “Authentication failed” | Wrong URI or credentials | Check `.env` and verify Atlas user permissions |
| Duplicate user error | Seeding run multiple times | Clear existing collection before re-seeding |
| Admin missing | Seed script failed | Re-run `npm run seed:admin` after verifying DB connection |

---

## 7. Outcome
✅ User and admin records successfully seeded in MongoDB.  
✅ Role separation established (`user` vs `admin`).  
✅ Ready for authentication testing and login integration.  

---

**Author:** Kamalasankari Subramaniakuppusamy  (on behalf of the team Greenshoes)              
**Date:** October 30 2025  
**Version:** v1.0  
**Module:** User and Admin Seeding

