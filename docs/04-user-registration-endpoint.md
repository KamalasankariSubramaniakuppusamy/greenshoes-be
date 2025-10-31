# 🧾 04 – User Registration Endpoint

## 1. Purpose
To create a secure API endpoint for user registration, enabling new users to create accounts and store their credentials safely in the database.  
This marks the starting point of GreenShoes’ authentication workflow.

---

## 2. Objectives
- Implement an endpoint for new user sign-up.  
- Ensure all required fields (`username`, `email`, `password`) are validated.  
- Hash passwords securely before saving to the database.  
- Prevent duplicate account creation.  
- Return a confirmation response upon success.  

---

## 3. Prerequisites
- Active MongoDB Atlas connection.  
- User schema properly defined in the `models` directory.  
- Express server running locally on port 8080.  
- Postman or equivalent API testing tool installed.

---

## 4. Steps to Implement

### Step 1 – Define the Route  
A new route `/api/auth/register` was created under the `routes` directory.  
This endpoint accepts POST requests with JSON payloads containing `username`, `email`, and `password`.

### Step 2 – Validate Input  
Before creating a record, the server checks:
- All required fields are provided.  
- The email is not already registered.  

### Step 3 – Hash and Store Password  
User passwords are hashed using a secure hashing function (`bcrypt`) before being stored.  
No plain-text credentials are saved in the database.

### Step 4 – Save User Record  
If validation passes, the new user record is created in MongoDB.  
A JSON response is sent confirming successful registration.

---

## 5. Testing and Verification

### Step 1 – Send POST Request
Using Postman:  
- URL: `http://localhost:8080/api/auth/register`  
- Method: `POST`  
- Header: `Content-Type: application/json`  
- Body (JSON example):
  ```json
  {
    "username": <user's name>,
    "email": <email address of the user>,
    "password": <user's account password>  

  }
  ```
### Step 2 – Expected Response

A successful registration returns a 201 response:
```
{
  "message": "User registered successfully",
  "user": {
    "username": This will have the specific user's name,
    "email": This will have the respective email id of the user,
    "role": "user",
    "is2FAEnabled": Boolean value
  }
}
```

### 6. Verification in MongoDB

Open MongoDB Atlas → Collections → ```greenshoes``` → ```users```.

Confirm the newly created user record appears.

Ensure that:

1.  The password is encrypted.

2. The role is user.

3. The timestamps are correct.

### 7. Outcome

* New user registration successfully implemented and tested.
* Secure password hashing verified.
* Duplicate prevention working correctly.
* System ready for JWT-based login integration.

---
---

**Author:** Kamalasankari Subramaniakuppusamy        
**Date:** October 30 2025   
**Version:** v1.0         
**Module:** User Registration Endpoint