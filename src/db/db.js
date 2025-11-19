import pool from "./pool.js";

export const query = (text, params) => {
  return pool.query(text, params);
};


