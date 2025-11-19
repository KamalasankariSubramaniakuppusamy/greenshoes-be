// src/seed/seedUsers.js

import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import { query } from "../db/db.js";

const users = [
  { fullName: "Aarav Nair", email: "aarav.nair@example.com", password: "Aarav!2002" },
  { fullName: "Sofia Müller", email: "sofia.muller@example.de", password: "Sofia#Berlin" },
  { fullName: "Liam O'Connor", email: "liam.oconnor@example.ie", password: "LiamIrish@91" },
  { fullName: "Mei Ling", email: "mei.ling@example.sg", password: "MeiLing#88" },
  { fullName: "Diego Fernandez", email: "diego.fernandez@example.es", password: "Diego123@" },
  { fullName: "Amara Okafor", email: "amara.okafor@example.ng", password: "Amara2025!" },
  { fullName: "Isabella Rossi", email: "isabella.rossi@example.it", password: "BellaRoma#9" },
  { fullName: "Yuki Tanaka", email: "yuki.tanaka@example.jp", password: "Yuki*Tokyo" },
  { fullName: "Lucas Moreira", email: "lucas.moreira@example.br", password: "LucasBR@77" },
  { fullName: "Chloe Dupont", email: "chloe.dupont@example.fr", password: "ChloeParis!1" },
  { fullName: "Noah Smith", email: "noah.smith@example.com", password: "Noah-USA@1" },
  { fullName: "Fatima Al-Said", email: "fatima.said@example.ae", password: "FatimaAE$" },
  { fullName: "Haruto Sato", email: "haruto.sato@example.jp", password: "HarutoJP#3" },
  { fullName: "Maria Petrova", email: "maria.petrova@example.ru", password: "MariaRU!55" },
  { fullName: "Chen Wei", email: "chen.wei@example.cn", password: "ChenCN123!" },
  { fullName: "Emily Johnson", email: "emily.johnson@example.com", password: "EmilyUSA#9" },
  { fullName: "Rajesh Kulkarni", email: "rajesh.kulkarni@example.in", password: "Rajesh#Mumbai" },
  { fullName: "Ana Marquez", email: "ana.marquez@example.mx", password: "AnaMX@2024" },
  { fullName: "Jacob Anderson", email: "jacob.anderson@example.com", password: "Jacob_NYC1" },
  { fullName: "Sara Lindström", email: "sara.lindstrom@example.se", password: "SaraSweden!" },
  { fullName: "Mohamed Khoury", email: "mohamed.khoury@example.eg", password: "Mohamed#Egypt" },
  { fullName: "Hana Kim", email: "hana.kim@example.kr", password: "HanaKorea1!" },
  { fullName: "Oliver Brown", email: "oliver.brown@example.com", password: "OllyBrown#7" },
  { fullName: "Aisha Khan", email: "aisha.khan@example.pk", password: "AishaPK@77" },
  { fullName: "Daniel Müller", email: "daniel.muller2@example.de", password: "DanielDE$" }
];

async function seedUsers() {
  try {
    console.log("Seeding customers...");

    for (const user of users) {
      const hashed = await bcrypt.hash(user.password, 12);

      await query(
        `INSERT INTO users (full_name, email, password_hash, role)
         VALUES ($1, $2, $3, 'CUSTOMER')`,
        [user.fullName, user.email, hashed]
      );
    }

    console.log("✅ 25 real customers seeded successfully.");
  } catch (err) {
    console.error("❌ Error seeding customers:", err);
  } finally {
    // Very important so Node exits
    process.exit(0);
  }
}

// 👉 ACTUALLY RUN IT
seedUsers();


import pkg from "pg";
import bcrypt from "bcrypt";

const { Client } = pkg;

const client = new Client({
  user: "postgres",
  host: "localhost",
  database: "greenshoes",
  password: "YOUR_DB_PASSWORD",
  port: 5432,
});

async function seedUsers() {
  try {
    await client.connect();
    console.log("Connected to DB");

    // ----------------------------------------
    // 1. ADMIN USER
    // ----------------------------------------
    const adminPassword = await bcrypt.hash("Admin@123", 12);

    await client.query(
      `
      INSERT INTO users (id, full_name, email, password_hash, role)
      VALUES (uuid_generate_v4(), $1, $2, $3, 'ADMIN')
      `,
      ["GreenShoes Admin", "admin@greenshoes.com", adminPassword]
    );

    console.log("Admin user created!");

    // ----------------------------------------
    // 2. CREATE 10 FAKE USERS
    // ----------------------------------------
    const fakeUsers = [
      { name: "Ava Thompson", email: "ava@example.com" },
      { name: "Mia Johnson", email: "miaJ@example.com" },
      { name: "Ella Brown", email: "ellaB@example.com" },
      { name: "Sophia Lee", email: "sophia@example.com" },
      { name: "Chloe Martin", email: "chloeM@example.com" },
      { name: "Isabella Clark", email: "isabella@example.com" },
      { name: "Zoe Adams", email: "zoe@example.com" },
      { name: "Grace Lewis", email: "grace@example.com" },
      { name: "Lily Walker", email: "lily@example.com" },
      { name: "Emily White", email: "emily@example.com" }
    ];

    for (let user of fakeUsers) {
      const hashedPassword = await bcrypt.hash("Password@123", 12);

      await client.query(
        `
        INSERT INTO users (id, full_name, email, password_hash)
        VALUES (uuid_generate_v4(), $1, $2, $3)
        `,
        [user.name, user.email, hashedPassword]
      );

      console.log(`User ${user.email} created`);
    }

    console.log("All fake users created successfully!");

  } catch (err) {
    console.error("Seeding error", err);
  } finally {
    await client.end();
    console.log("DB connection closed");
  }
}

seedUsers();
